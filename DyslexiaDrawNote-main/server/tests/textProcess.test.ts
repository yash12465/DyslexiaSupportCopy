import test from "node:test";
import assert from "node:assert/strict";
import { applyLocalCorrections, processText } from "../../server/services/textProcessingService";
import { GroqAiService } from "../../server/services/groqService";

// ---------------------------------------------------------------------------
// applyLocalCorrections — deterministic layer
// ---------------------------------------------------------------------------

test("applyLocalCorrections fixes common dyslexic misspellings", () => {
  const { result, changed } = applyLocalCorrections("I recieve a freind at teh adress.");
  assert.equal(changed, true);
  assert.ok(result.includes("receive"), `expected 'receive' in: ${result}`);
  assert.ok(result.includes("friend"), `expected 'friend' in: ${result}`);
  assert.ok(result.includes("the"), `expected 'the' in: ${result}`);
  assert.ok(result.includes("address"), `expected 'address' in: ${result}`);
});

test("applyLocalCorrections preserves capitalisation", () => {
  const { result, changed } = applyLocalCorrections("Teh cat recieve milk.");
  assert.equal(changed, true);
  assert.ok(result.startsWith("The"), `expected 'The' at start of: ${result}`);
  assert.ok(result.includes("receive"), `expected 'receive' in: ${result}`);
});

test("applyLocalCorrections leaves correct text unchanged", () => {
  const { result, changed } = applyLocalCorrections("The quick brown fox.");
  assert.equal(changed, false);
  assert.equal(result, "The quick brown fox.");
});

test("applyLocalCorrections handles all-uppercase word", () => {
  const { result, changed } = applyLocalCorrections("TEH sky is blue.");
  assert.equal(changed, true);
  assert.ok(result.includes("THE"), `expected 'THE' in: ${result}`);
});

// ---------------------------------------------------------------------------
// processText — integration with fallback behaviour
// ---------------------------------------------------------------------------

test("processText returns local-corrected result when Groq is not configured", async () => {
  const previous = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;

  const result = await processText("Teh freind definately recieve teh lettr.");
  assert.equal(result.provider, "local");
  assert.equal(result.correctionsApplied, true);
  assert.ok(result.normalizedText.includes("The") || result.normalizedText.includes("the"));

  if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  else delete process.env.GROQ_API_KEY;
});

test("processText returns provider=none for already-correct text with no Groq", async () => {
  const previous = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;

  const result = await processText("The quick brown fox jumps over the lazy dog.");
  assert.equal(result.provider, "none");
  assert.equal(result.correctionsApplied, false);
  assert.equal(result.originalText, result.normalizedText);

  if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  else delete process.env.GROQ_API_KEY;
});

test("processText uses Groq response when available", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";

  const mockService = new GroqAiService({
    fetchImpl: (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "The friend definitely received the letter." } }],
        }),
      }) as Response) as typeof fetch,
  });

  const result = await processText("Teh freind definately recieve teh lettr.", mockService);
  assert.equal(result.provider, "groq");
  assert.equal(result.correctionsApplied, true);
  assert.ok(result.normalizedText.includes("friend"));

  if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  else delete process.env.GROQ_API_KEY;
});

test("processText falls back to local when Groq call fails", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";

  const mockService = new GroqAiService({
    fetchImpl: (async () => {
      throw new Error("network failure");
    }) as unknown as typeof fetch,
    retryCount: 0,
  });

  const result = await processText("Teh freind is recieve.", mockService);
  assert.equal(result.provider, "local");
  assert.equal(result.correctionsApplied, true);

  if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  else delete process.env.GROQ_API_KEY;
});

// ---------------------------------------------------------------------------
// GroqAiService unit tests
// ---------------------------------------------------------------------------

test("GroqAiService returns not-configured message when API key is missing", async () => {
  const previous = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;

  const service = new GroqAiService();
  const response = await service.normalizeText("teh cat");
  assert.equal(response.ok, false);
  assert.match(response.message, /not configured/i);

  if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  else delete process.env.GROQ_API_KEY;
});

test("GroqAiService returns corrected text on success", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";

  const service = new GroqAiService({
    fetchImpl: (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "The cat sat on the mat." } }],
        }),
      }) as Response) as typeof fetch,
  });

  const response = await service.normalizeText("teh cat sat on teh mat.");
  assert.equal(response.ok, true);
  assert.equal(response.text, "The cat sat on the mat.");

  if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  else delete process.env.GROQ_API_KEY;
});

test("GroqAiService retries on transient failure", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";

  let calls = 0;
  const service = new GroqAiService({
    retryCount: 1,
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Corrected output." } }],
        }),
      } as Response;
    }) as typeof fetch,
  });

  const response = await service.normalizeText("wirte teh lettr");
  assert.equal(response.ok, true);
  assert.equal(calls, 2);

  if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  else delete process.env.GROQ_API_KEY;
});

test("GroqAiService returns error on non-retryable 4xx", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";

  const service = new GroqAiService({
    fetchImpl: (async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid API key" } }),
      }) as Response) as typeof fetch,
  });

  const response = await service.normalizeText("teh cat");
  assert.equal(response.ok, false);
  assert.match(response.message, /401/);

  if (previous !== undefined) process.env.GROQ_API_KEY = previous;
  else delete process.env.GROQ_API_KEY;
});
