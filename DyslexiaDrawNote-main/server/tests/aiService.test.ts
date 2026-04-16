import test from "node:test";
import assert from "node:assert/strict";
import { GeminiAiService } from "../services/aiService";

test("Gemini service returns configuration message when API key is missing", async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const service = new GeminiAiService();
  const response = await service.askQuestion("What is AI?");

  assert.equal(response.ok, false);
  assert.match(response.message, /not configured/i);

  process.env.GEMINI_API_KEY = previous;
});

test("Gemini service retries transient failure and normalizes output", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  let attempts = 0;
  const service = new GeminiAiService({
    retryCount: 1,
    fetchImpl: (async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary network issue");
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: "Corrected text\n- first suggestion\n- second suggestion" }],
              },
            },
          ],
        }),
      } as Response;
    }) as typeof fetch,
  });

  const response = await service.predictWriting("teh cat run fast");
  assert.equal(response.ok, true);
  assert.equal(attempts, 2);
  assert.ok(response.result);
  assert.match(response.result!.text, /Corrected text/);
  assert.equal(response.result!.suggestions.length > 0, true);

  process.env.GEMINI_API_KEY = previous;
});
