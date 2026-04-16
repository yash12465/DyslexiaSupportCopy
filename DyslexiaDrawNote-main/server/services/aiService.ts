type AiTask = "ask" | "writing" | "correction" | "ocr-cleanup";

interface GeminiApiPart {
  text?: string;
}

interface GeminiApiCandidate {
  content?: {
    parts?: GeminiApiPart[];
  };
}

interface GeminiApiPayload {
  candidates?: GeminiApiCandidate[];
}

export interface AiNormalizedResult {
  task: AiTask;
  text: string;
  suggestions: string[];
  model: string;
}

export interface AiServiceResponse {
  ok: boolean;
  result: AiNormalizedResult | null;
  message: string;
}

interface GeminiAiServiceOptions {
  fetchImpl?: typeof fetch;
  model?: string;
  timeoutMs?: number;
  retryCount?: number;
}

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const DEFAULT_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 12000);
const DEFAULT_RETRY_COUNT = Number(process.env.GEMINI_RETRY_COUNT ?? 1);

function normalizeSuggestions(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter((line) => Boolean(line) && line.length <= 120)
    .slice(0, 4);
}

function extractText(payload: GeminiApiPayload): string {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

export class GeminiAiService {
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;

  constructor(options: GeminiAiServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.model = options.model || DEFAULT_GEMINI_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryCount = Math.max(0, options.retryCount ?? DEFAULT_RETRY_COUNT);
  }

  private getApiKey() {
    return process.env.GEMINI_API_KEY?.trim();
  }

  private async runPrompt(task: AiTask, prompt: string): Promise<AiServiceResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        ok: false,
        result: null,
        message: "AI is not configured yet. Ask your teacher/admin to set GEMINI_API_KEY.",
      };
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    let attempt = 0;

    while (attempt <= this.retryCount) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 600,
            },
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as GeminiApiPayload;
        const text = extractText(payload);

        if (response.ok && text) {
          return {
            ok: true,
            message: "ok",
            result: {
              task,
              text,
              suggestions: normalizeSuggestions(text),
              model: this.model,
            },
          };
        }

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          break;
        }
      } catch (error) {
        if (attempt >= this.retryCount) {
          const timedOut = error instanceof Error && error.name === "AbortError";
          return {
            ok: false,
            result: null,
            message: timedOut ? "The AI request timed out. Please try again." : "Could not reach AI service right now.",
          };
        }
      } finally {
        clearTimeout(timeout);
      }

      attempt += 1;
    }

    return {
      ok: false,
      result: null,
      message: "AI is busy right now. Please try again in a moment.",
    };
  }

  askQuestion(question: string, history: string[] = []) {
    const compactHistory = history.slice(-5).join("\n");
    return this.runPrompt(
      "ask",
      [
        "You are a dyslexia-friendly study helper.",
        "Give short, clear answers with simple words.",
        "Prefer bullets and short paragraphs.",
        compactHistory ? `Conversation context:\n${compactHistory}` : "",
        `Student question: ${question}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  correctWriting(text: string) {
    return this.runPrompt(
      "correction",
      [
        "Correct spelling and grammar while preserving the student's intended meaning.",
        "Do not over-rewrite. Keep sentence structure close to original.",
        "Return the corrected text first, then a short bullet list of key fixes.",
        `Input text:\n${text}`,
      ].join("\n\n"),
    );
  }

  predictWriting(text: string) {
    return this.runPrompt(
      "writing",
      [
        "You support dyslexic students while they write.",
        "Return corrected version of the input first.",
        "Then add 2-3 short next-phrase suggestions as bullets.",
        "Keep suggestions simple and close to the student's intent.",
        `Input text:\n${text}`,
      ].join("\n\n"),
    );
  }

  cleanupOcrText(text: string) {
    return this.runPrompt(
      "ocr-cleanup",
      [
        "Clean OCR text from an image.",
        "Fix obvious OCR mistakes, spacing, and punctuation while preserving meaning.",
        "Return only cleaned text.",
        `OCR text:\n${text}`,
      ].join("\n\n"),
    );
  }
}

export const geminiAiService = new GeminiAiService();
