type GroqTask = "correction";

interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqApiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface GroqServiceResponse {
  ok: boolean;
  text: string | null;
  message: string;
  model: string;
}

interface GroqServiceOptions {
  fetchImpl?: typeof fetch;
  model?: string;
  timeoutMs?: number;
  retryCount?: number;
}

const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || "llama3-8b-8192";
const DEFAULT_GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS ?? 12000);
const DEFAULT_GROQ_RETRY_COUNT = Number(process.env.GROQ_RETRY_COUNT ?? 1);

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

function extractGroqText(payload: GroqApiResponse): string {
  return payload.choices?.[0]?.message?.content?.trim() ?? "";
}

export class GroqAiService {
  private readonly fetchImpl: typeof fetch;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;

  constructor(options: GroqServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.model = options.model || DEFAULT_GROQ_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GROQ_TIMEOUT_MS;
    this.retryCount = Math.max(0, options.retryCount ?? DEFAULT_GROQ_RETRY_COUNT);
  }

  private getApiKey() {
    return process.env.GROQ_API_KEY?.trim();
  }

  private async runPrompt(
    _task: GroqTask,
    messages: GroqChatMessage[],
  ): Promise<GroqServiceResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        ok: false,
        text: null,
        message: "Groq is not configured. Set GROQ_API_KEY in environment variables.",
        model: this.model,
      };
    }

    let attempt = 0;

    while (attempt <= this.retryCount) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0.2,
            max_tokens: 1024,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as GroqApiResponse;
        const text = extractGroqText(payload);

        if (response.ok && text) {
          return { ok: true, text, message: "ok", model: this.model };
        }

        // Do not retry on non-recoverable 4xx errors (except rate limit 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return {
            ok: false,
            text: null,
            message: `Groq API error: ${response.status}`,
            model: this.model,
          };
        }
      } catch (error) {
        if (attempt >= this.retryCount) {
          const timedOut = error instanceof Error && error.name === "AbortError";
          return {
            ok: false,
            text: null,
            message: timedOut
              ? "Groq request timed out. Please try again."
              : "Could not reach Groq service.",
            model: this.model,
          };
        }
      } finally {
        clearTimeout(timeout);
      }

      attempt += 1;
    }

    return {
      ok: false,
      text: null,
      message: "Groq service is busy. Please try again in a moment.",
      model: this.model,
    };
  }

  /**
   * Normalize/correct text that may contain dyslexic misspellings.
   * Returns the corrected text only (no extra commentary).
   */
  normalizeText(text: string): Promise<GroqServiceResponse> {
    const messages: GroqChatMessage[] = [
      {
        role: "system",
        content: [
          "You are a text normalization assistant for a dyslexia support app.",
          "The user will give you text that may contain dyslexic misspellings, letter transpositions, or phonetic spellings.",
          "Your job: correct all spelling errors and return ONLY the corrected text — nothing else.",
          "Preserve the original meaning, tone, and sentence structure as closely as possible.",
          "Do not add explanations, comments, or bullet points. Output corrected text only.",
        ].join(" "),
      },
      { role: "user", content: text },
    ];

    return this.runPrompt("correction", messages);
  }
}

export const groqAiService = new GroqAiService();
