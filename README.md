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
- `GROQ_API_KEY` – server-side Groq key for the text normalization endpoint (never commit real keys)

Optional:

- `GEMINI_MODEL` (default: `gemini-2.0-flash`)
- `GEMINI_TIMEOUT_MS` (default: `12000`)
- `GEMINI_RETRY_COUNT` (default: `1`)
- `ANALYZE_RATE_LIMIT_MAX` (default: `30`)
- `GROQ_MODEL` (default: `llama3-8b-8192`) — also accepts `llama3-70b-8192`, `mixtral-8x7b-32768`
- `GROQ_TIMEOUT_MS` (default: `12000`)
- `GROQ_RETRY_COUNT` (default: `1`)
- `TEXT_PROCESS_RATE_LIMIT_MAX` (default: `30`)

## AI API endpoints

- `POST /api/ai/ask`
- `POST /api/ai/writing`
- `POST /api/ai/correct`
- `POST /api/ai/ocr-cleanup`

All Gemini calls are routed through backend endpoints. No client-side API key is used.

## Text normalization endpoint

### `POST /api/text/process`

Detects dyslexic misspellings and returns normalized text.
Processing uses Groq LLM when `GROQ_API_KEY` is configured, with automatic fallback to a
local deterministic correction layer so the endpoint always returns useful output.

**Request**

```json
{ "text": "Teh freind definately recieve teh lettr." }
```

**Response**

```json
{
  "originalText":       "Teh freind definately recieve teh lettr.",
  "normalizedText":     "The friend definitely receive the letter.",
  "correctionsApplied": true,
  "provider":           "groq",
  "processedAt":        "2025-01-01T12:00:00.000Z"
}
```

`provider` values:
- `"groq"` — Groq LLM corrected the text
- `"local"` — deterministic local dictionary corrected the text (Groq not configured or unavailable)
- `"none"` — no corrections needed

**Errors**

| Status | Condition |
|--------|-----------|
| 400    | Missing or empty `text` field |
| 413    | `text` exceeds 5 000 characters |
| 429    | Rate limit exceeded (30 req/min per IP by default) |
| 500    | Unexpected server error |

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
