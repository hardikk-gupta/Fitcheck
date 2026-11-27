"""Fit Check notebook and keyless, CPU-only voice endpoint."""
import io
import json
import logging
import os
import socket
import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get('MODEL_PATH', ROOT / 'models' / 'base'))
MAX_BYTES = 8 * 1024 * 1024
MAX_SECONDS = 30
PORT = int(os.environ.get('PORT', '3000'))
UI = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/style.css': ('style.css', 'text/css; charset=utf-8'),
    '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
    '/fit.js': ('fit.js', 'text/javascript; charset=utf-8'),
    '/garment.js': ('garment.js', 'text/javascript; charset=utf-8'),
}
GARMENT_TERMS = {
    'shirt': 'Chest, waist, neck, shoulder, sleeve, shirt length.',
    'trousers': 'Waist, hip, thigh, inseam, leg opening, trouser length.',
}
LANGUAGES = {'auto': None, 'en': 'en', 'hi': 'hi', 'pa': 'pa'}
LOG = logging.getLogger('fitcheck')


class Voice:
    def __init__(self):
        self.model = None
        self.status = 'loading'
        self.lock = threading.Lock()

    def load(self):
        try:
            from faster_whisper import WhisperModel
            if not (MODEL_DIR / 'model.bin').is_file():
                raise FileNotFoundError('Local speech model missing. See README.')
            self.model = WhisperModel(str(MODEL_DIR), device='cpu', compute_type='int8',
                                      cpu_threads=min(4, os.cpu_count() or 1), local_files_only=True)
            self.status = 'ready'
            LOG.info('Local speech engine ready')
        except Exception:
            self.status = 'unavailable'
            LOG.exception('Local speech engine could not start')

    @staticmethod
    def pcm(blob):
        import av
        import numpy as np
        samples = []
        size = 0
        resample = av.audio.resampler.AudioResampler(format='s16', layout='mono', rate=16000)
        try:
            with av.open(io.BytesIO(blob), mode='r') as container:
                if not container.streams.audio:
                    raise ValueError('No audio track found in this file.')
                def append(frames):
                    nonlocal size
                    for frame in frames:
                        size += frame.samples
                        if size > (MAX_SECONDS + .2) * 16000:
                            raise ValueError('Record or upload a clip no longer than 30 seconds.')
                        samples.append(frame.to_ndarray().reshape(-1))
                for frame in container.decode(audio=0):
                    append(resample.resample(frame))
                append(resample.resample(None))
        except (av.error.FFmpegError, EOFError) as err:
            raise ValueError('Could not read this audio file. Try WAV, MP3, M4A, or WebM.') from err
        if size < 1600:
            raise ValueError('The clip is empty or too short. Try a new recording.')
        return np.concatenate(samples).astype(np.float32) / 32768

    def transcribe(self, blob, language, garment):
        audio = self.pcm(blob)
        segments, info = self.model.transcribe(
            audio, language=language, beam_size=5, condition_on_previous_text=False,
            initial_prompt=GARMENT_TERMS[garment] if language in (None, 'en') else None,
            vad_filter=True, vad_parameters={'min_silence_duration_ms': 550},
        )
        text = ' '.join(segment.text.strip() for segment in segments).strip()
        return {'text': text[:1000], 'language': info.language}


voice = Voice()


class FitServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class FitHandler(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(20)
        super().setup()

    def write_body(self, status, content_type, body, head=False):
        try:
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            if not head:
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_json(self, status, payload, head=False):
        self.write_body(status, 'application/json; charset=utf-8',
                        json.dumps(payload, ensure_ascii=False).encode(), head)

    def _get(self, head=False):
        path = urlsplit(self.path).path
        if path == '/api/health':
            self.send_json(HTTPStatus.OK, {'status': 'ok', 'voiceStatus': voice.status, 'voiceReady': voice.status == 'ready'}, head)
        elif path in UI:
            name, content_type = UI[path]
            self.write_body(HTTPStatus.OK, content_type, (ROOT / 'public' / name).read_bytes(), head)
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {'error': 'Not found.'}, head)

    def do_GET(self):
        self._get()

    def do_HEAD(self):
        self._get(head=True)

    def do_POST(self):
        url = urlsplit(self.path)
        if url.path != '/api/transcribe':
            return self.send_json(HTTPStatus.NOT_FOUND, {'error': 'Not found.'})
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            return self.send_json(HTTPStatus.FORBIDDEN, {'error': 'Use the Fit Check page to upload audio.'})
        params = parse_qs(url.query)
        language = params.get('language', ['auto'])[0]
        garment = params.get('garment', ['shirt'])[0]
        if garment not in GARMENT_TERMS:
            return self.send_json(HTTPStatus.BAD_REQUEST, {'error': 'Unsupported garment choice.'})
        if language not in LANGUAGES:
            return self.send_json(HTTPStatus.BAD_REQUEST, {'error': 'Unsupported language choice.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_BYTES:
            return self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                                  {'error': 'Provide an audio clip under 8 MB.'})
        if voice.status != 'ready':
            return self.send_json(HTTPStatus.SERVICE_UNAVAILABLE,
                                  {'error': 'The local voice engine is still starting.' if voice.status == 'loading'
                                   else 'Local speech is unavailable. Type or paste the measurements.'})
        if not voice.lock.acquire(blocking=False):
            return self.send_json(HTTPStatus.TOO_MANY_REQUESTS, {'error': 'Another clip is processing. Try again shortly.'})
        try:
            blob = self.rfile.read(length)
            if len(blob) != length:
                return self.send_json(HTTPStatus.BAD_REQUEST, {'error': 'Incomplete upload.'})
            result = voice.transcribe(blob, LANGUAGES[language], garment)
            self.send_json(HTTPStatus.OK, result)
        except (ValueError, socket.timeout) as err:
            self.send_json(HTTPStatus.BAD_REQUEST, {'error': str(err)})
        except Exception:
            LOG.exception('Transcription failed')
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {'error': 'Could not transcribe that clip.'})
        finally:
            voice.lock.release()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    with FitServer((os.environ.get('HOST', '127.0.0.1'), PORT), FitHandler) as server:
        if '--ui-only' in sys.argv:
            voice.status = 'unavailable'
        else:
            threading.Thread(target=voice.load, name='voice-engine', daemon=True).start()
        LOG.info('Fit Check serving on port %s', PORT)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
