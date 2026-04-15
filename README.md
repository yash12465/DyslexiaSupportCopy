# DyslexiaSupportCopy

Modern dyslexia-support web app with:

- Automatic text analysis (`/analyze`) with debounce, explainability, confidence thresholds, and cache-aware results
- Accessible UI controls: high-contrast mode, dyslexia-friendly font toggle, readable spacing
- Canvas visualization tools for reading flow and syllable segmentation preview
- Free resource hub and no-key dictionary suggestions
- API endpoint for stable analysis integration: `POST /api/analyze`

## Project path

Main app: `./DyslexiaDrawNote-main`

## Local setup

```bash
cd DyslexiaDrawNote-main
npm install --ignore-scripts
npm run dev
```

Open `http://localhost:5000`.

## Automatic analysis flow

1. User types or pastes text on **Analyze Text** page.
2. Frontend debounces input (~700ms).
3. Client checks in-memory cache for repeated input.
4. If not cached, UI calls `POST /api/analyze` with configurable `minConfidence`.
5. API normalizes/tokenizes text, runs pattern-based dyslexia analysis, returns:
   - confidence annotations
   - highlighted recommendations
   - readability and estimated accuracy scores
   - optional free dictionary enrichments
6. UI shows progress, highlights, and timestamp.

## API

### `POST /api/analyze`

Body:

```json
{
  "text": "Teh freind wrote a note",
  "minConfidence": 0.55,
  "includeExternalSuggestions": false
}
```

Response includes `analysis`, `analyzedAt`, `cached`, and optional `externalSuggestions`.

### `GET /api/dictionary?word=<term>`

Returns free no-key suggestions via Datamuse.

## Environment variables

- `ANALYZE_RATE_LIMIT_MAX` (optional, default `30`): max analyze requests per minute per IP.

No API keys are required for default local development.

## Testing

```bash
cd DyslexiaDrawNote-main
npm run test
```

CI workflow (`.github/workflows/ci.yml`) installs deps, runs tests, and builds the app.
