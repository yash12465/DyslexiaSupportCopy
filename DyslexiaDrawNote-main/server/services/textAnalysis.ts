import { createHash } from "crypto";

export interface AnalysisOptions {
  minConfidence?: number;
  includeExternalSuggestions?: boolean;
}

export interface AnalysisAnnotation {
  word: string;
  start: number;
  end: number;
  confidence: number;
  issueType: "spelling" | "readability" | "pattern";
  explanation: string;
  recommendation: string;
}

export interface AnalysisResult {
  normalizedText: string;
  language: "en" | "unknown";
  confidenceThreshold: number;
  readabilityScore: number;
  modelAccuracyEstimate: number;
  annotations: AnalysisAnnotation[];
  recommendations: string[];
  evaluation: {
    totalWords: number;
    flaggedWords: number;
    likelyCorrectWords: number;
  };
}

export interface EvaluationSample {
  text: string;
  expectedCorrections: string[];
}

const COMMON_CORRECTIONS: Record<string, string> = {
  teh: "the",
  recieve: "receive",
  becuase: "because",
  definately: "definitely",
  seperate: "separate",
  adress: "address",
  occured: "occurred",
  freind: "friend",
  thier: "their",
  wierd: "weird",
};

const CONFUSION_PATTERNS: Array<{ pattern: RegExp; recommendation: string; confidence: number }> = [
  { pattern: /\b(bd|db|pq|qp)\b/i, recommendation: "Check letter orientation (b/d or p/q).", confidence: 0.78 },
  { pattern: /ie(?!f)/i, recommendation: "Review i/e ordering in this word.", confidence: 0.58 },
  { pattern: /(.)\1\1+/i, recommendation: "Repeated letters may be accidental.", confidence: 0.66 },
];

const splitWords = (text: string) => {
  const regex = /[A-Za-z']+/g;
  const words: Array<{ word: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    words.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }

  return words;
};

export const normalizeText = (text: string): string =>
  text
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

export const detectLanguage = (text: string): "en" | "unknown" => {
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const allChars = text.replace(/\s+/g, "").length;

  if (allChars === 0) return "unknown";
  return letters / allChars > 0.55 ? "en" : "unknown";
};

export const getAnalysisCacheKey = (text: string, options: AnalysisOptions): string => {
  const payload = JSON.stringify({
    text: normalizeText(text),
    minConfidence: options.minConfidence ?? 0.55,
    includeExternalSuggestions: Boolean(options.includeExternalSuggestions),
  });

  return createHash("sha256").update(payload).digest("hex");
};

export const analyzeText = (text: string, options: AnalysisOptions = {}): AnalysisResult => {
  const minConfidence = Math.max(0.3, Math.min(0.95, options.minConfidence ?? 0.55));
  const normalizedText = normalizeText(text);
  const words = splitWords(normalizedText);
  const annotations: AnalysisAnnotation[] = [];

  for (const { word, start, end } of words) {
    const lower = word.toLowerCase();

    if (COMMON_CORRECTIONS[lower]) {
      annotations.push({
        word,
        start,
        end,
        confidence: 0.86,
        issueType: "spelling",
        explanation: `This matches a frequent dyslexia-related misspelling pattern (${lower}).`,
        recommendation: `Consider "${COMMON_CORRECTIONS[lower]}".`,
      });
    }

    for (const item of CONFUSION_PATTERNS) {
      if (item.pattern.test(lower)) {
        annotations.push({
          word,
          start,
          end,
          confidence: item.confidence,
          issueType: "pattern",
          explanation: "Pattern-based dyslexia confusion detected.",
          recommendation: item.recommendation,
        });
      }
    }

    if (word.length > 12) {
      annotations.push({
        word,
        start,
        end,
        confidence: 0.6,
        issueType: "readability",
        explanation: "Long words can reduce readability for dyslexic readers.",
        recommendation: "Try splitting into shorter words or adding punctuation.",
      });
    }
  }

  const filteredAnnotations = annotations.filter((item) => item.confidence >= minConfidence);
  const totalWords = words.length;
  const flaggedWords = new Set(filteredAnnotations.map((item) => `${item.start}-${item.end}`)).size;
  const likelyCorrectWords = Math.max(totalWords - flaggedWords, 0);

  const readabilityPenalty = Math.min(filteredAnnotations.length * 3, 40);
  const readabilityScore = Math.max(100 - readabilityPenalty, 48);
  const modelAccuracyEstimate = totalWords === 0 ? 100 : Number(((likelyCorrectWords / totalWords) * 100).toFixed(1));

  const recommendations = [
    "Use short sentences and clear punctuation.",
    "Increase line spacing for easier tracking.",
    "Review highlighted words with confidence above threshold.",
  ];

  return {
    normalizedText,
    language: detectLanguage(normalizedText),
    confidenceThreshold: minConfidence,
    readabilityScore,
    modelAccuracyEstimate,
    annotations: filteredAnnotations,
    recommendations,
    evaluation: {
      totalWords,
      flaggedWords,
      likelyCorrectWords,
    },
  };
};

export const evaluateAnalysisSamples = (samples: EvaluationSample[]) => {
  const details = samples.map((sample) => {
    const result = analyzeText(sample.text);
    const foundRecommendations = result.annotations.map((annotation) => annotation.recommendation.toLowerCase());
    const expectedMatches = sample.expectedCorrections.filter((expected) =>
      foundRecommendations.some((found) => found.includes(expected.toLowerCase())),
    );

    return {
      text: sample.text,
      expected: sample.expectedCorrections.length,
      matched: expectedMatches.length,
      score: sample.expectedCorrections.length === 0 ? 1 : expectedMatches.length / sample.expectedCorrections.length,
    };
  });

  const overall = details.length
    ? Number((details.reduce((acc, item) => acc + item.score, 0) / details.length).toFixed(3))
    : 1;

  return { overall, details };
};
