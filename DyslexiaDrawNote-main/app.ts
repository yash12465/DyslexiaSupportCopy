import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import multer from "multer";
import { createHash } from "crypto";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
import { nanoid } from "nanoid";
import { v4 as uuidv4 } from "uuid";

/**
 * ------------------------------------------------------------
 * DyslexiaDrawNote single-file runtime
 * ------------------------------------------------------------
 * This file consolidates runtime backend features so the app can run
 * out-of-the-box via one entrypoint command.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = process.cwd();
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? 5000);

const PATHS = {
  uploads: path.join(APP_ROOT, "uploads"),
  rawUploads: path.join(APP_ROOT, "uploads", "raw"),
  trainingUploads: path.join(APP_ROOT, "uploads", "training"),
  ocrModel: path.join(APP_ROOT, "ocr-model"),
  modelCache: path.join(APP_ROOT, "model-cache"),
  logsDir: path.join(APP_ROOT, "logs"),
  dataDir: path.join(APP_ROOT, "data"),
  configDir: path.join(APP_ROOT, "config"),
  configFile: path.join(APP_ROOT, "config", "defaults.json"),
  trainingMetadata: path.join(APP_ROOT, "uploads", "training", "metadata.json"),
};

const DEFAULT_CONFIG = {
  analyzeRateLimitMax: 30,
  analyzeCacheTtlMs: 1000 * 60 * 30,
  maxAnalysisTextLength: 10000,
  dictionaryApiTimeoutMs: 1000,
};

function resolveWithin(baseDir: string, inputPath: string) {
  const resolved = path.resolve(baseDir, path.basename(inputPath));
  const normalizedBase = path.resolve(baseDir);

  if (resolved !== normalizedBase && !resolved.startsWith(`${normalizedBase}${path.sep}`)) {
    throw new Error("Invalid file path.");
  }

  return resolved;
}

function isWithinAllowedRoots(candidatePath: string, allowedRoots: string[]) {
  const resolvedCandidate = path.resolve(candidatePath);
  return allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return resolvedCandidate === normalizedRoot || resolvedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
  });
}

function log(message: string, source = "app") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function ensureStartupFilesAndDirectories() {
  const requiredDirectories = [
    PATHS.uploads,
    PATHS.rawUploads,
    PATHS.trainingUploads,
    PATHS.ocrModel,
    PATHS.modelCache,
    PATHS.logsDir,
    PATHS.dataDir,
    PATHS.configDir,
  ];

  for (const dir of requiredDirectories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`Created directory: ${path.relative(APP_ROOT, dir)}`, "startup");
    }
  }

  if (!fs.existsSync(PATHS.configFile)) {
    fs.writeFileSync(PATHS.configFile, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
    log("Created default config: config/defaults.json", "startup");
  }

  if (!fs.existsSync(PATHS.trainingMetadata)) {
    fs.writeFileSync(PATHS.trainingMetadata, JSON.stringify({ images: [] }, null, 2), "utf8");
    log("Created training metadata: uploads/training/metadata.json", "startup");
  }

  if (!process.env.OPENAI_API_KEY) {
    log("OPENAI_API_KEY not set. Optional OpenAI features stay disabled.", "startup");
  }
}

/**
 * ------------------------------------------------------------
 * Note schema + in-memory storage
 * ------------------------------------------------------------
 */

const insertNoteSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(""),
  preview: z.string().nullable().optional(),
  recognizedText: z.string().nullable().optional(),
  isFavorite: z.boolean().optional(),
});

type InsertNote = z.infer<typeof insertNoteSchema>;
interface Note {
  id: number;
  title: string;
  content: string;
  preview: string | null;
  recognizedText: string | null;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class MemStorage {
  private notesMap = new Map<number, Note>();
  private noteCurrentId = 1;

  constructor() {
    this.createNote({
      title: "Welcome to DyslexiNote",
      content: "",
      preview: "",
      recognizedText: "Welcome to DyslexiNote, a dyslexia-friendly note-taking app.",
      isFavorite: true,
    });

    this.createNote({
      title: "How to Use",
      content: "",
      preview: "",
      recognizedText: "Draw on the canvas and use text recognition to convert handwriting to text.",
      isFavorite: false,
    });
  }

  async getAllNotes(): Promise<Note[]> {
    return Array.from(this.notesMap.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getNote(id: number): Promise<Note | undefined> {
    return this.notesMap.get(id);
  }

  async createNote(insertNote: InsertNote): Promise<Note> {
    const id = this.noteCurrentId++;
    const now = new Date();

    const note: Note = {
      id,
      title: insertNote.title,
      content: insertNote.content,
      preview: insertNote.preview ?? null,
      recognizedText: insertNote.recognizedText ?? null,
      isFavorite: insertNote.isFavorite ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.notesMap.set(id, note);
    return note;
  }

  async updateNote(id: number, updatedFields: Partial<InsertNote>): Promise<Note | undefined> {
    const existingNote = this.notesMap.get(id);
    if (!existingNote) return undefined;

    const updatedNote: Note = {
      ...existingNote,
      ...updatedFields,
      preview: updatedFields.preview !== undefined ? updatedFields.preview : existingNote.preview,
      recognizedText:
        updatedFields.recognizedText !== undefined ? updatedFields.recognizedText : existingNote.recognizedText,
      updatedAt: new Date(),
    };

    this.notesMap.set(id, updatedNote);
    return updatedNote;
  }

  async deleteNote(id: number): Promise<boolean> {
    return this.notesMap.delete(id);
  }
}

const storage = new MemStorage();

/**
 * ------------------------------------------------------------
 * Text analysis engine (API + tests consume these exports)
 * ------------------------------------------------------------
 */

export interface AnalysisOptions {
  minConfidence?: number;
  includeExternalSuggestions?: boolean;
}

interface AnalysisAnnotation {
  word: string;
  start: number;
  end: number;
  confidence: number;
  issueType: "spelling" | "readability" | "pattern";
  explanation: string;
  recommendation: string;
}

interface AnalysisResult {
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

interface EvaluationSample {
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
  { pattern: /(bd|db|pq|qp)/i, recommendation: "Check letter orientation (b/d or p/q).", confidence: 0.78 },
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

const detectLanguage = (text: string): "en" | "unknown" => {
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
        recommendation: `Consider \"${COMMON_CORRECTIONS[lower]}\".`,
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

  const filteredAnnotations = annotations
    .filter((item) => item.confidence >= minConfidence)
    .sort((a, b) => a.start - b.start);

  const totalWords = words.length;
  const flaggedWords = new Set(filteredAnnotations.map((item) => `${item.start}-${item.end}`)).size;
  const likelyCorrectWords = Math.max(totalWords - flaggedWords, 0);

  const readabilityPenalty = Math.min(filteredAnnotations.length * 3, 40);
  const readabilityScore = Math.max(100 - readabilityPenalty, 48);
  const modelAccuracyEstimate = totalWords === 0 ? 100 : Number(((likelyCorrectWords / totalWords) * 100).toFixed(1));

  return {
    normalizedText,
    language: detectLanguage(normalizedText),
    confidenceThreshold: minConfidence,
    readabilityScore,
    modelAccuracyEstimate,
    annotations: filteredAnnotations,
    recommendations: [
      "Use short sentences and clear punctuation.",
      "Increase line spacing for easier tracking.",
      "Review highlighted words with confidence above threshold.",
    ],
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

    const unexpectedFlags = sample.expectedCorrections.length === 0 ? result.annotations.length : 0;
    return {
      text: sample.text,
      expected: sample.expectedCorrections.length,
      matched: expectedMatches.length,
      score:
        sample.expectedCorrections.length === 0
          ? unexpectedFlags === 0
            ? 1
            : 0
          : expectedMatches.length / sample.expectedCorrections.length,
    };
  });

  const overall = details.length
    ? Number((details.reduce((acc, item) => acc + item.score, 0) / details.length).toFixed(3))
    : 1;

  return { overall, details };
};

/**
 * ------------------------------------------------------------
 * Optional OCR model integration
 * ------------------------------------------------------------
 */

const IMAGE_SIZE = 28;
const CHAR_SET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,?!-_'\";:()[]{}<>";
const MODEL_JSON_PATH = path.join(PATHS.ocrModel, "model.json");

let tfModule: typeof import("@tensorflow/tfjs-node") | null = null;
let ocrModel: import("@tensorflow/tfjs-node").LayersModel | null = null;

async function getTf() {
  if (tfModule) return tfModule;

  try {
    tfModule = await import("@tensorflow/tfjs-node");
    return tfModule;
  } catch {
    throw new Error(
      "TensorFlow native module is unavailable. OCR endpoints are optional; continue using text analysis features.",
    );
  }
}

async function createOcrModel() {
  const tf = await getTf();
  const model = tf.sequential();

  model.add(
    tf.layers.conv2d({
      inputShape: [IMAGE_SIZE, IMAGE_SIZE, 1],
      filters: 32,
      kernelSize: 3,
      activation: "relu",
      padding: "same",
    }),
  );
  model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
  model.add(tf.layers.conv2d({ filters: 64, kernelSize: 3, activation: "relu", padding: "same" }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
  model.add(tf.layers.conv2d({ filters: 128, kernelSize: 3, activation: "relu", padding: "same" }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({ units: 256, activation: "relu" }));
  model.add(tf.layers.dropout({ rate: 0.5 }));
  model.add(tf.layers.dense({ units: CHAR_SET.length, activation: "softmax" }));
  model.compile({ optimizer: "adam", loss: "categoricalCrossentropy", metrics: ["accuracy"] });

  return model;
}

async function initializeOcrModel() {
  const tf = await getTf();

  if (ocrModel) return ocrModel;

  if (fs.existsSync(MODEL_JSON_PATH)) {
    ocrModel = await tf.loadLayersModel(`file://${MODEL_JSON_PATH}`);
  } else {
    ocrModel = await createOcrModel();
    await ocrModel.save(`file://${PATHS.ocrModel}`);
  }

  return ocrModel;
}

async function preprocessImage(fileName: string, baseDir: string) {
  const tf = await getTf();
  const imagePath = resolveWithin(baseDir, fileName);

  if (!isWithinAllowedRoots(imagePath, [PATHS.uploads, PATHS.trainingUploads, PATHS.rawUploads])) {
    throw new Error("Invalid OCR image path.");
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const tfImage = tf.node.decodeImage(imageBuffer, 1);
  const resized = tf.image.resizeBilinear(tfImage, [IMAGE_SIZE, IMAGE_SIZE]);
  const normalized = tf.div(resized, 255.0);
  const batched = tf.expandDims(normalized, 0) as import("@tensorflow/tfjs-node").Tensor4D;

  tfImage.dispose();
  resized.dispose();
  normalized.dispose();

  return batched;
}

async function preprocessCanvas(canvasDataUrl: string) {
  const tempFile = path.join(PATHS.uploads, `temp_${Date.now()}.png`);
  const base64Data = canvasDataUrl.replace(/^data:image\/\w+;base64,/, "");
  fs.writeFileSync(tempFile, Buffer.from(base64Data, "base64"));

  try {
    return await preprocessImage(path.basename(tempFile), PATHS.uploads);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function recognizeTextFromTensor(imageTensor: import("@tensorflow/tfjs-node").Tensor4D) {
  const model = await initializeOcrModel();

  const prediction = model.predict(imageTensor) as import("@tensorflow/tfjs-node").Tensor;
  const argMax = prediction.argMax(1);
  const index = (await argMax.data())[0];

  prediction.dispose();
  argMax.dispose();

  return CHAR_SET.charAt(index);
}

/**
 * ------------------------------------------------------------
 * API and route registration
 * ------------------------------------------------------------
 */

const analysisCache = new Map<string, { value: unknown; createdAt: number }>();
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const scopedRateLimiter = new Map<string, { count: number; resetAt: number }>();

const ANALYZE_CACHE_TTL_MS = Number(process.env.ANALYZE_CACHE_TTL_MS ?? DEFAULT_CONFIG.analyzeCacheTtlMs);
const RATE_LIMIT_WINDOW_MS = 1000 * 60;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.ANALYZE_RATE_LIMIT_MAX ?? DEFAULT_CONFIG.analyzeRateLimitMax);
const MAX_ANALYSIS_TEXT_LENGTH = Number(process.env.MAX_ANALYSIS_TEXT_LENGTH ?? DEFAULT_CONFIG.maxAnalysisTextLength);
const DICTIONARY_API_TIMEOUT_MS = Number(process.env.DICTIONARY_API_TIMEOUT_MS ?? DEFAULT_CONFIG.dictionaryApiTimeoutMs);

interface TrainingImage {
  id: string;
  label: string;
  filename: string;
  path: string;
}

let trainingImages: TrainingImage[] = [];

function loadTrainingImages() {
  try {
    const metadata = JSON.parse(fs.readFileSync(PATHS.trainingMetadata, "utf8")) as { images?: TrainingImage[] };
    const images = metadata.images ?? [];
    trainingImages = images.filter((img) => fs.existsSync(resolveWithin(PATHS.trainingUploads, img.filename)));
  } catch {
    trainingImages = [];
  }
}

function saveTrainingImagesMetadata() {
  fs.writeFileSync(PATHS.trainingMetadata, JSON.stringify({ images: trainingImages }, null, 2), "utf8");
}

function pruneAnalysisCache() {
  const now = Date.now();
  for (const [key, item] of analysisCache.entries()) {
    if (now - item.createdAt > ANALYZE_CACHE_TTL_MS) {
      analysisCache.delete(key);
    }
  }
}

function getClientIp(req: Request) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function allowRateLimit(ip: string) {
  const now = Date.now();
  const current = rateLimiter.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return false;

  current.count += 1;
  return true;
}

function allowScopedRateLimit(scope: string, ip: string, maxRequests: number, windowMs = RATE_LIMIT_WINDOW_MS) {
  const now = Date.now();
  const key = `${scope}:${ip}`;
  const current = scopedRateLimiter.get(key);

  if (!current || current.resetAt <= now) {
    scopedRateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= maxRequests) return false;

  current.count += 1;
  return true;
}

async function fetchDictionarySuggestions(word: string): Promise<string[]> {
  const endpoint = `https://api.datamuse.com/words?max=3&sp=${encodeURIComponent(word)}&md=f`;

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(DICTIONARY_API_TIMEOUT_MS),
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as Array<{ word?: string }>;
    return payload.map((item) => item.word).filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

function configureRoutes(app: Express): Server {
  loadTrainingImages();

  app.use("/api/ocr", (req, res, next) => {
    if (!allowScopedRateLimit("ocr", getClientIp(req), 60)) {
      return res.status(429).json({ success: false, message: "Too many OCR requests. Please retry in a minute." });
    }
    return next();
  });

  const uploadRaw = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, PATHS.rawUploads),
      filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
    }),
  });

  const uploadTraining = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, PATHS.trainingUploads),
      filename: (_req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed"));
      }
    },
  });

  app.get("/api/notes", async (_req, res) => {
    try {
      res.json(await storage.getAllNotes());
    } catch {
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.get("/api/notes/:id", async (req, res) => {
    try {
      const note = await storage.getNote(Number(req.params.id));
      if (!note) return res.status(404).json({ message: "Note not found" });
      res.json(note);
    } catch {
      res.status(500).json({ message: "Failed to fetch note" });
    }
  });

  app.post("/api/notes", async (req, res) => {
    try {
      const validated = insertNoteSchema.parse(req.body);
      res.status(201).json(await storage.createNote(validated));
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  app.put("/api/notes/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const validated = insertNoteSchema.partial().parse(req.body);
      const note = await storage.updateNote(id, validated);

      if (!note) return res.status(404).json({ message: "Note not found" });
      res.json(note);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  app.delete("/api/notes/:id", async (req, res) => {
    try {
      const success = await storage.deleteNote(Number(req.params.id));
      if (!success) return res.status(404).json({ message: "Note not found" });
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  app.post("/api/recognize-text", uploadRaw.single("image"), (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) return res.status(400).json({ message: "No image uploaded" });

    return res.status(200).json({
      message: "Image saved",
      path: filePath,
    });
  });

  app.post("/api/analyze", async (req, res) => {
    pruneAnalysisCache();
    const ip = getClientIp(req);

    if (!allowRateLimit(ip)) {
      return res.status(429).json({ message: "Too many analysis requests. Please retry in a minute." });
    }

    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const minConfidence = Number(req.body?.minConfidence ?? 0.55);
    const includeExternalSuggestions = Boolean(req.body?.includeExternalSuggestions);

    if (!text.trim()) {
      return res.status(400).json({ message: "Text is required for analysis." });
    }

    if (text.length > MAX_ANALYSIS_TEXT_LENGTH) {
      return res.status(413).json({
        message: `Text payload is too large. Max ${MAX_ANALYSIS_TEXT_LENGTH.toLocaleString("en-US")} characters.`,
      });
    }

    const cacheKey = getAnalysisCacheKey(text, { minConfidence, includeExternalSuggestions });
    const cached = analysisCache.get(cacheKey);

    if (cached) {
      return res.json({
        ...cached.value,
        cached: true,
      });
    }

    const analysis = analyzeText(text, { minConfidence, includeExternalSuggestions });

    let externalSuggestions: Record<string, string[]> = {};
    if (includeExternalSuggestions) {
      const uniqueWords = Array.from(new Set(analysis.annotations.map((item) => item.word.toLowerCase()))).slice(0, 5);
      const entries = await Promise.all(
        uniqueWords.map(async (word) => [word, await fetchDictionarySuggestions(word)] as const),
      );
      externalSuggestions = Object.fromEntries(entries);
    }

    const payload = {
      analyzedAt: new Date().toISOString(),
      cached: false,
      analysis,
      externalSuggestions,
    };

    analysisCache.set(cacheKey, {
      value: payload,
      createdAt: Date.now(),
    });

    return res.json(payload);
  });

  app.get("/api/dictionary", async (req, res) => {
    const word = String(req.query.word || "").trim();
    if (!word) {
      return res.status(400).json({ message: "Query parameter 'word' is required." });
    }

    const suggestions = await fetchDictionarySuggestions(word);
    return res.json({ word, suggestions });
  });

  // OCR routes (optional feature)
  app.post("/api/ocr/initialize", async (_req, res) => {
    try {
      await initializeOcrModel();
      const modelInfo = await getModelInfo();
      res.json({ success: true, message: "OCR model initialized successfully", modelInfo });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize OCR model";
      res.status(503).json({ success: false, message });
    }
  });

  app.get("/api/ocr/model-info", async (_req, res) => {
    try {
      res.json({ success: true, modelInfo: await getModelInfo() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get model info";
      res.status(503).json({ success: false, message });
    }
  });

  app.post("/api/ocr/training-image", uploadTraining.single("image"), async (req, res) => {
    if (!req.file || !req.body.label) {
      return res.status(400).json({ success: false, message: "Image file and label are required" });
    }

    const id = uuidv4();
    const imageRecord: TrainingImage = {
      id,
      label: req.body.label,
      filename: req.file.filename,
      path: `/api/ocr/training-image/${id}`,
    };

    trainingImages.push(imageRecord);
    saveTrainingImagesMetadata();

    return res.json({ success: true, message: "Training image uploaded successfully", image: imageRecord });
  });

  app.get("/api/ocr/training-images", (_req, res) => {
    res.json({ success: true, trainingImages });
  });

  app.get("/api/ocr/training-image/:id", (req, res) => {
    if (!allowScopedRateLimit("ocr-training-image-read", getClientIp(req), 60)) {
      return res.status(429).json({ success: false, message: "Too many requests. Please retry in a minute." });
    }

    const imageRecord = trainingImages.find((img) => img.id === req.params.id);
    if (!imageRecord) {
      return res.status(404).json({ success: false, message: "Training image not found" });
    }

    const imagePath = resolveWithin(PATHS.trainingUploads, imageRecord.filename);
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ success: false, message: "Training image not found" });
    }
    return res.sendFile(imagePath);
  });

  app.delete("/api/ocr/training-image/:id", (req, res) => {
    if (!allowScopedRateLimit("ocr-training-image-delete", getClientIp(req), 60)) {
      return res.status(429).json({ success: false, message: "Too many requests. Please retry in a minute." });
    }

    const imageRecord = trainingImages.find((img) => img.id === req.params.id);
    if (!imageRecord) {
      return res.status(404).json({ success: false, message: "Training image not found" });
    }

    const imagePath = resolveWithin(PATHS.trainingUploads, imageRecord.filename);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    trainingImages = trainingImages.filter((img) => img.id !== req.params.id);
    saveTrainingImagesMetadata();

    return res.json({ success: true, message: "Training image deleted successfully" });
  });

  app.post("/api/ocr/train", async (req, res) => {
    const { imageId, label } = req.body;

    if (!imageId || !label) {
      return res.status(400).json({ success: false, message: "Image ID and label are required" });
    }

    try {
      const imageRecord = trainingImages.find((img) => img.id === imageId);
      if (!imageRecord) {
        return res.status(404).json({ success: false, message: "Training image not found" });
      }

      const tensor = await preprocessImage(imageRecord.filename, PATHS.trainingUploads);
      await trainOnBatch([{ tensor, label }]);
      tensor.dispose();

      return res.json({ success: true, message: "Model trained successfully with image" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to train model";
      return res.status(503).json({ success: false, message });
    }
  });

  app.post("/api/ocr/train-batch", async (_req, res) => {
    if (trainingImages.length === 0) {
      return res.status(400).json({ success: false, message: "No training images available" });
    }

    try {
      const batchData = await Promise.all(
        trainingImages.map(async (img) => {
          const tensor = await preprocessImage(img.filename, PATHS.trainingUploads);
          return { tensor, label: img.label };
        }),
      );

      await trainOnBatch(batchData);
      for (const item of batchData) {
        item.tensor.dispose();
      }

      return res.json({ success: true, message: `Model trained on batch of ${trainingImages.length} images` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to train on batch";
      return res.status(503).json({ success: false, message });
    }
  });

  app.post("/api/ocr/recognize", uploadRaw.single("image"), async (req, res) => {
    if (!allowScopedRateLimit("ocr-recognize", getClientIp(req), 60)) {
      return res.status(429).json({ success: false, message: "Too many OCR requests. Please retry in a minute." });
    }

    try {
      if (req.file?.path) {
        const safeUploadedPath = resolveWithin(PATHS.rawUploads, path.basename(req.file.path));
        const tensor = await preprocessImage(path.basename(safeUploadedPath), PATHS.rawUploads);
        const text = await recognizeTextFromTensor(tensor);
        tensor.dispose();

        if (fs.existsSync(safeUploadedPath)) {
          fs.unlinkSync(safeUploadedPath);
        }

        return res.json({ success: true, text });
      }

      const canvasDataUrl = typeof req.body?.canvasData === "string" ? req.body.canvasData : "";
      if (!canvasDataUrl) {
        return res.status(400).json({ success: false, message: "Image file or canvasData is required" });
      }

      const tensor = await preprocessCanvas(canvasDataUrl);
      const text = await recognizeTextFromTensor(tensor);
      tensor.dispose();

      return res.json({ success: true, text });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to recognize text";
      return res.status(503).json({ success: false, message });
    }
  });

  return createServer(app);
}

async function trainOnBatch(examples: Array<{ tensor: import("@tensorflow/tfjs-node").Tensor4D; label: string }>) {
  const tf = await getTf();
  const model = await initializeOcrModel();

  const batchSize = examples.length;
  const xs = tf.concat(examples.map((ex) => ex.tensor));
  const ys = tf.buffer([batchSize, CHAR_SET.length]);

  examples.forEach((example, i) => {
    const char = example.label.charAt(0);
    const charIndex = CHAR_SET.indexOf(char);
    ys.set(1, i, charIndex === -1 ? 0 : charIndex);
  });

  await model.fit(xs, ys.toTensor(), {
    epochs: 10,
    batchSize: Math.min(32, batchSize),
    shuffle: true,
    verbose: 0,
  });

  await model.save(`file://${PATHS.ocrModel}`);
  xs.dispose();
}

async function getModelInfo() {
  try {
    const modelExists = fs.existsSync(MODEL_JSON_PATH);
    if (!modelExists) {
      return {
        exists: false,
        modelType: "CNN Character Recognition",
        inputShape: [IMAGE_SIZE, IMAGE_SIZE, 1],
        outputShape: [CHAR_SET.length],
        numClasses: CHAR_SET.length,
        charSet: CHAR_SET,
      };
    }

    const model = await initializeOcrModel();
    return {
      exists: true,
      modelType: "CNN Character Recognition",
      inputShape: model.inputs[0].shape,
      outputShape: model.outputs[0].shape,
      numClasses: CHAR_SET.length,
      charSet: CHAR_SET,
    };
  } catch {
    return {
      exists: false,
      modelType: "CNN Character Recognition (Unavailable)",
      inputShape: [IMAGE_SIZE, IMAGE_SIZE, 1],
      outputShape: [CHAR_SET.length],
      numClasses: CHAR_SET.length,
      charSet: CHAR_SET,
    };
  }
}

/**
 * ------------------------------------------------------------
 * Vite + static serving
 * ------------------------------------------------------------
 */

const viteLogger = createLogger();

async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true,
    },
    appType: "custom",
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    if (!allowScopedRateLimit("vite-page", getClientIp(req), 240)) {
      return res.status(429).json({ message: "Too many page requests. Please retry shortly." });
    }

    try {
      const clientTemplate = path.resolve(APP_ROOT, "client", "index.html");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace('src="/src/main.tsx"', `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find build directory: ${distPath}. Run npm run build first.`);
  }

  app.use(express.static(distPath));
  app.use("*", (req, res) => {
    if (!allowScopedRateLimit("static-page", getClientIp(req), 240)) {
      return res.status(429).json({ message: "Too many page requests. Please retry shortly." });
    }

    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

export async function startServer() {
  ensureStartupFilesAndDirectories();

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const pathName = req.path;

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (pathName.startsWith("/api")) {
        let logLine = `${req.method} ${pathName} ${res.statusCode} in ${duration}ms`;

        if (logLine.length > 200) {
          logLine = `${logLine.slice(0, 199)}…`;
        }

        log(logLine, "api");
      }
    });

    next();
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api") && !allowScopedRateLimit("pages", getClientIp(req), 240)) {
      return res.status(429).json({ message: "Too many page requests. Please retry shortly." });
    }
    return next();
  });

  const server = configureRoutes(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 500;
    const message = err instanceof Error ? err.message : "Internal Server Error";

    res.status(status).json({ message });
  });

  if (IS_PRODUCTION) {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  server.listen(
    {
      port: PORT,
      host: "0.0.0.0",
    },
    () => {
      log(`DyslexiaDrawNote started on http://localhost:${PORT}`, "startup");
      log(`Mode=${IS_PRODUCTION ? "production" : "development"}`, "startup");
    },
  );

  return server;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === path.resolve(__filename);
}

if (isMainModule()) {
  startServer().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    log(`Fatal startup error: ${message}`, "startup");
    process.exit(1);
  });
}
