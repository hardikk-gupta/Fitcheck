#!/usr/bin/env bash
set -euo pipefail
base=http://127.0.0.1:3000
wav=$(mktemp --suffix=.wav)
out=$(mktemp)
trap 'rm -f "$wav" "$out"' EXIT
curl --retry 8 --retry-connrefused --fail --silent "$base/" | grep -q 'Fit Check'
curl --fail --silent "$base/api/health" | python3 -c 'import json, sys; assert json.load(sys.stdin)["voiceReady"]'
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "flite=text='The chest measures thirty four inches, and the sleeve measures twenty two inches.':voice=slt" \
  -af "adelay=250,apad=pad_dur=0.3" -ar 16000 -ac 1 "$wav"
curl --fail --silent --show-error -H 'Content-Type: audio/wav' --data-binary "@$wav" \
  "$base/api/transcribe?language=en" > "$out"
node tests/speech-result.mjs "$out"
