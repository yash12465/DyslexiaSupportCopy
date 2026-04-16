import { createWorker } from "tesseract.js";

interface RecognitionResult {
  text: string;
  suggestions: Array<{
    original: string;
    correction: string;
  }>;
  formattedText: string;
}

function formatToStandardFont(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildSuggestions(rawText: string) {
  const pairs: Array<[RegExp, string]> = [
    [/\bteh\b/gi, "the"],
    [/\bfreind\b/gi, "friend"],
    [/\brecieve\b/gi, "receive"],
    [/\bdefinately\b/gi, "definitely"],
  ];

  const found: RecognitionResult["suggestions"] = [];
  for (const [pattern, correction] of pairs) {
    const match = rawText.match(pattern)?.[0];
    if (match) {
      found.push({ original: match, correction });
    }
  }
  return found;
}

async function runOcr(image: string | File, onProgress?: (progressPercent: number) => void) {
  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress?.(Math.round((message.progress ?? 0) * 100));
      }
    },
  });

  try {
    const { data } = await worker.recognize(image);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromImageFile(file: File, onProgress?: (progressPercent: number) => void) {
  return runOcr(file, onProgress);
}

export async function recognizeText(imageDataUrl: string): Promise<RecognitionResult> {
  const text = await runOcr(imageDataUrl);
  const formattedText = formatToStandardFont(text);
  return {
    text,
    formattedText,
    suggestions: buildSuggestions(formattedText),
  };
}
