# Fit Check
**A voice-first fitting notebook for independent tailors.**

Keep both hands on the tape. Say the part and the number; Fit Check puts the measurement where it belongs on the garment. Review the numbers before saving a fitting slip.

## Run for judging

Clone this repository and check out the branch containing the prototype if it is not on the default branch. Then, from the repository root:

```sh
docker compose up --build
```

Open **http://localhost:3000**. Use localhost, not a LAN IP: the browser requires a secure context for microphone access. The first build needs internet for dependencies and the public model files (about 142 MiB). Runtime speech processing uses CPU and requires **no account, API key, GPU, or .env file**. The main screen can open while voice is warming up. A recent Chrome or Edge browser is recommended.

### Two-minute walkthrough

1. Choose **Shirt** or **Shirt + trousers**. Leave the units on inches and optionally enter a customer name.
2. Click **Record measurements**, allow the microphone, and say: “Chest thirty-four, sleeve twenty-two.” Stop the recording. The raw transcript is available under the capture controls and the two numbers appear on the garment.
3. Record “Chest thirty-six.” The slip shows the proposed number separately from the existing value and asks you to choose. Confirm it or edit the field by selecting its callout. Say “Correct chest to thirty-six” to explicitly correct an existing value.
4. For an outfit, choose **Next: trousers**. Say “Waist thirty-two, inseam thirty.” Each garment has its own measurements. Unsaid values remain blank.
5. Save. Open the saved slip to confirm the numbers persist. A slip may be partial, but review flags must be addressed before saving.

**Without a mic:** Upload a short audio clip for real transcription (up to 30 seconds and 8 MB), or paste a transcript. Use **Try a sample** for a clearly labelled example, not as proof of voice. For **Wispr Flow** dictation, focus the app’s transcript field, dictate into it, then select **Find measurements**. This is a text-entry path for the desktop dictation tool, not a Wispr SDK or API integration.

## How it works

- An original, dependency-free browser interface renders the fitting slips and shaded SVG garment diagrams.
- The browser records and sends short clips to the same local server. A pinned multilingual Whisper base model runs on CPU via [faster-whisper](https://github.com/SYSTRAN/faster-whisper). The Docker build fetches and verifies the [model assets](https://huggingface.co/Systran/faster-whisper-base). The server does not upload recordings to a third party or retain the audio.
- A deterministic parser maps recognized phrases to the selected garment’s fields. It handles numeric/decimal strings and common English and Hindi measurement names and number forms. It flags detectable problems such as multiple numbers or explicit unit mismatches; it cannot reliably catch every speech misrecognition. Always review against the tape.
- Auto detection and explicit language choices are available, but field mapping has limited vocabulary. Hindi/Hinglish and Punjabi accents are not guaranteed. Mixes, numbers, shop noise and latency need real tailor testing. Typing, file upload and Wispr dictation provide alternative ways to enter measurements.
- Slips stay in browser storage with no cross-device sync. Audio and raw transcripts are not part of the saved slip. Browser data can be cleared by the user. This is a local prototype, not a multi-user hosted deployment.

## Local development

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python get_model.py
python server.py
```

Use `python server.py --ui-only` for design work without dependencies or voice. For parser tests, run `npm test` with Node.js 20 or later; there are no npm dependencies to install.

The [upstream Whisper license](https://github.com/openai/whisper/blob/main/LICENSE) and [faster-whisper license](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE) cover their respective dependencies. Fit Check's UI, measurement parser, drawings and fitting flow are separate app code.
