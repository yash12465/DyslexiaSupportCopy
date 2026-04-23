import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertNoteSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import multer from "multer";
import path from "path";
import fs from "fs";
import { analyzeText, getAnalysisCacheKey } from "./services/textAnalysis";

const analysisCache = new Map<string, { value: unknown; createdAt: number }>();
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

const ANALYZE_CACHE_TTL_MS = 1000 * 60 * 30;
const RATE_LIMIT_WINDOW_MS = 1000 * 60;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.ANALYZE_RATE_LIMIT_MAX ?? 30);
const MAX_ANALYSIS_TEXT_LENGTH = 10000;
const DICTIONARY_API_TIMEOUT_MS = 1000;

function pruneAnalysisCache() {
  const now = Date.now();
  for (const [key, item] of analysisCache.entries()) {
    if (now - item.createdAt > ANALYZE_CACHE_TTL_MS) {
      analysisCache.delete(key);
    }
  }
}

function getClientIp(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function allowRateLimit(ip: string) {
  const now = Date.now();
  const current = rateLimiter.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

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

export async function registerRoutes(app: Express): Promise<Server> {
  try {
    const ocrRoutesModule = await import("./routes/ocrRoutes");
    app.use("/api/ocr", ocrRoutesModule.default);
  } catch (error) {
    console.warn("OCR routes disabled: TensorFlow native module unavailable.", error);
  }

  const { default: textRoutes } = await import("./routes/textRoutes");
  app.use("/api/text", textRoutes);

  app.get("/api/notes", async (_req, res) => {
    try {
      const notes = await storage.getAllNotes();
      res.json(notes);
    } catch {
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.get("/api/notes/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const note = await storage.getNote(id);

      if (!note) return res.status(404).json({ message: "Note not found" });
      res.json(note);
    } catch {
      res.status(500).json({ message: "Failed to fetch note" });
    }
  });

  app.post("/api/notes", async (req, res) => {
    try {
      const validated = insertNoteSchema.parse(req.body);
      const note = await storage.createNote(validated);
      res.status(201).json(note);
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

  const rawDir = path.join("uploads", "raw");
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

  const storageEngine = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, rawDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  const upload = multer({ storage: storageEngine });

  app.post("/api/recognize-text", upload.single("image"), (req, res) => {
    const filePath = req.file?.path;
    if (!filePath) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    res.status(200).json({
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
      return res.status(413).json({ message: `Text payload is too large. Max ${MAX_ANALYSIS_TEXT_LENGTH.toLocaleString("en-US")} characters.` });
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
    res.json({ word, suggestions });
  });

  app.delete("/api/notes/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const success = await storage.deleteNote(id);

      if (!success) {
        return res.status(404).json({ message: "Note not found" });
      }

      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
