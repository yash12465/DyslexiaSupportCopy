export interface AiResult {
  task: "ask" | "writing" | "correction" | "ocr-cleanup";
  text: string;
  suggestions: string[];
  model: string;
}

interface AiResponse {
  success: boolean;
  message?: string;
  result?: AiResult;
}

async function postAi<TPayload>(path: string, payload: TPayload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as AiResponse;

  if (!response.ok || !body.success || !body.result) {
    throw new Error(body.message || "AI request failed");
  }

  return body.result;
}

export const askAiQuestion = (question: string, history: string[]) => postAi("/api/ai/ask", { question, history });
export const getWritingSupport = (text: string) => postAi("/api/ai/writing", { text });
export const cleanupOcrText = (text: string) => postAi("/api/ai/ocr-cleanup", { text });
