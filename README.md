# DyslexiaSupportCopy

AI-powered dyslexia support web app with:

- **AI Assistant page (`/ai`)** with:
  - ask-a-question search/chat
  - voice input assistant (speech-to-text)
  - text-to-speech read aloud controls
  - OCR image scan + AI cleanup
  - top-input/bottom-output writing support with auto-correction updates
- Existing text analysis page (`/analyze`) and note/canvas tools

## Project path

Main app: `./DyslexiaDrawNote-main`

## Local setup

```bash
cd DyslexiaDrawNote-main
npm install --ignore-scripts
cp .env.example .env
```

Set `GEMINI_API_KEY` in `.env`, then run:

```bash
npm run dev
```

Open `http://localhost:5000`.

## Environment variables

Required for AI routes:

- `GEMINI_API_KEY` – server-side Gemini key (never commit real keys)

Optional:

- `GEMINI_MODEL` (default: `gemini-2.0-flash`)
- `GEMINI_TIMEOUT_MS` (default: `12000`)
- `GEMINI_RETRY_COUNT` (default: `1`)
- `ANALYZE_RATE_LIMIT_MAX` (default: `30`)

## AI API endpoints

- `POST /api/ai/ask`
- `POST /api/ai/writing`
- `POST /api/ai/correct`
- `POST /api/ai/ocr-cleanup`

All Gemini calls are routed through backend endpoints. No client-side API key is used.

## Key flows to test

1. Ask a question on `/ai` and verify answer history appears.
2. Type in writing workspace top box and verify corrected text updates in bottom box.
3. Start voice assistant and ask a question by microphone.
4. Use Read Aloud controls (play/pause/resume/stop, speed, voice).
5. Upload an image in OCR section and compare raw vs corrected text.

## Browser support notes

- **SpeechRecognition / webkitSpeechRecognition** support varies by browser.
- **SpeechSynthesis** voices/features vary by OS/browser.
- When unsupported, the UI shows fallback messages and keeps app usable.

## Testing

```bash
cd DyslexiaDrawNote-main
npm run test
npm run build
```
