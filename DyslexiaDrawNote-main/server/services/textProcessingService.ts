import { groqAiService, GroqAiService, type GroqServiceResponse } from "./groqService";
import { normalizeText, analyzeText } from "./textAnalysis";

export interface TextProcessResult {
  originalText: string;
  normalizedText: string;
  correctionsApplied: boolean;
  provider: "groq" | "local" | "none";
}

/**
 * Expanded dyslexia correction dictionary used for the deterministic local layer.
 * Corrections are applied case-insensitively and the original word's casing is preserved.
 */
const LOCAL_CORRECTIONS: Record<string, string> = {
  // Common reversals / transpositions
  teh: "the",
  hte: "the",
  adn: "and",
  nad: "and",
  waht: "what",
  taht: "that",
  tihs: "this",
  thsi: "this",
  forme: "from",
  form: "from",
  od: "do",
  doe: "do",
  // Common phonetic / confusion spellings
  recieve: "receive",
  beleive: "believe",
  becuase: "because",
  becouse: "because",
  definately: "definitely",
  definitly: "definitely",
  seperate: "separate",
  adress: "address",
  occured: "occurred",
  freind: "friend",
  thier: "their",
  wierd: "weird",
  calender: "calendar",
  goverment: "government",
  enviroment: "environment",
  experiance: "experience",
  lisence: "license",
  occassion: "occasion",
  ocasion: "occasion",
  untill: "until",
  accomodate: "accommodate",
  appearence: "appearance",
  arguement: "argument",
  begining: "beginning",
  benifit: "benefit",
  buisness: "business",
  carear: "career",
  cemetary: "cemetery",
  committment: "commitment",
  concious: "conscious",
  curiousity: "curiosity",
  damageing: "damaging",
  disatisfied: "dissatisfied",
  embaras: "embarrass",
  embarass: "embarrass",
  existance: "existence",
  familar: "familiar",
  foward: "forward",
  grammer: "grammar",
  harrass: "harass",
  heighth: "height",
  humourous: "humorous",
  ignorence: "ignorance",
  immedietly: "immediately",
  independance: "independence",
  indispensible: "indispensable",
  knowlege: "knowledge",
  liason: "liaison",
  maintainance: "maintenance",
  mischievious: "mischievous",
  misspell: "misspell",
  neccessary: "necessary",
  necesary: "necessary",
  noticable: "noticeable",
  occurance: "occurrence",
  paralell: "parallel",
  persistance: "persistence",
  posession: "possession",
  potatos: "potatoes",
  priveledge: "privilege",
  reccomend: "recommend",
  relevent: "relevant",
  rythm: "rhythm",
  shedule: "schedule",
  similer: "similar",
  speach: "speech",
  succesful: "successful",
  supercede: "supersede",
  tendancy: "tendency",
  tommorrow: "tomorrow",
  tounge: "tongue",
  truely: "truly",
  twelth: "twelfth",
  tyrany: "tyranny",
  unforseen: "unforeseen",
  visious: "vicious",
  wether: "whether",
  yatch: "yacht",
};

/**
 * Apply LOCAL_CORRECTIONS to the text, preserving word casing where possible.
 */
export function applyLocalCorrections(text: string): { result: string; changed: boolean } {
  let changed = false;

  const corrected = text.replace(/[A-Za-z']+/g, (word) => {
    const lower = word.toLowerCase();
    const replacement = LOCAL_CORRECTIONS[lower];
    if (!replacement) return word;

    changed = true;

    // Preserve capitalisation style — check all-uppercase first
    if (word === word.toUpperCase() && word.length > 1) {
      return replacement.toUpperCase();
    }
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });

  return { result: corrected, changed };
}

/**
 * Process text using Groq first (if configured), then fall back to local corrections.
 */
export async function processText(
  text: string,
  groqService?: GroqAiService,
): Promise<TextProcessResult> {
  const service = groqService ?? groqAiService;
  const originalText = normalizeText(text);

  // 1. Try Groq
  let groqResponse: GroqServiceResponse | null = null;
  try {
    groqResponse = await service.normalizeText(originalText);
  } catch {
    // Groq unreachable — fall through to local
  }

  if (groqResponse?.ok && groqResponse.text) {
    const normalizedText = normalizeText(groqResponse.text);
    return {
      originalText,
      normalizedText,
      correctionsApplied: normalizedText !== originalText,
      provider: "groq",
    };
  }

  // 2. Local deterministic fallback
  const { result: localResult, changed } = applyLocalCorrections(originalText);
  const normalizedLocal = normalizeText(localResult);

  return {
    originalText,
    normalizedText: normalizedLocal,
    correctionsApplied: changed,
    provider: changed ? "local" : "none",
  };
}
