"""Download four pinned public model assets and verify them before use."""
import hashlib
import sys
import time
from pathlib import Path
from urllib.request import urlopen

BASE = ('https://huggingface.co/Systran/faster-whisper-base/resolve/'
        'ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66/')
FILES = {
    'config.json': '56a6d8110d311f19c8f0471e562832c7527f146b567275bfca59fcf7c184da9a',
    'tokenizer.json': 'fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab',
    'vocabulary.txt': '34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913',
    'model.bin': 'd01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9',
}


def download(target):
    target.mkdir(parents=True, exist_ok=True)
    for name, expected in FILES.items():
        final = target / name
        if final.is_file():
            with final.open('rb') as existing:
                if hashlib.file_digest(existing, 'sha256').hexdigest() == expected:
                    continue
        interim = final.with_suffix(final.suffix + '.part')
        for attempt in range(3):
            try:
                with urlopen(BASE + name + '?download=true', timeout=90) as upstream, interim.open('wb') as out:
                    digest = hashlib.sha256()
                    while chunk := upstream.read(1024 * 1024):
                        digest.update(chunk)
                        out.write(chunk)
                if digest.hexdigest() != expected:
                    raise ValueError('Checksum mismatch: ' + name)
                interim.replace(final)
                print('Verified', name, flush=True)
                break
            except (OSError, ValueError):
                interim.unlink(missing_ok=True)
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)


if __name__ == '__main__':
    download(Path(sys.argv[1] if len(sys.argv) > 1 else 'models/base'))
