import express, { type Request, type Response } from "express";
import { processText } from "../services/textProcessingService";

const router = express.Router();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.TEXT_PROCESS_RATE_LIMIT_MAX ?? 30);
const MAX_TEXT_LENGTH = 5000;

const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

function allowRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);

  if (!entry || entry.resetAt <= now) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

/**
 * POST /api/text/process
 *
 * Normalize/correct text that may contain dyslexic misspellings.
 *
 * Request body (JSON):
 *   { "text": "<free-form input>" }
 *
 * Response (JSON):
 *   {
 *     "originalText":       string,
 *     "normalizedText":     string,
 *     "correctionsApplied": boolean,
 *     "provider":           "groq" | "local" | "none",
 *     "processedAt":        ISO-8601 string
 *   }
 */
router.post("/process", async (req: Request, res: Response) => {
  const ip = getClientIp(req);

  if (!allowRateLimit(ip)) {
    return res
      .status(429)
      .json({ message: "Too many text processing requests. Please retry in a minute." });
  }

  const text = typeof req.body?.text === "string" ? req.body.text : null;

  if (text === null) {
    return res.status(400).json({ message: "Request body must include a 'text' field." });
  }

  if (!text.trim()) {
    return res.status(400).json({ message: "The 'text' field must not be empty." });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res
      .status(413)
      .json({
        message: `Text is too long. Maximum allowed length is ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters.`,
      });
  }

  try {
    const result = await processText(text);
    return res.json({
      originalText: result.originalText,
      normalizedText: result.normalizedText,
      correctionsApplied: result.correctionsApplied,
      provider: result.provider,
      processedAt: new Date().toISOString(),
    });
  } catch {
    return res.status(500).json({ message: "Text processing failed. Please try again." });
  }
});

export default router;
