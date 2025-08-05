import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertNoteSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import ocrRoutes from "./routes/ocrRoutes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Register OCR routes
  app.use('/api/ocr', ocrRoutes);
  // Get all notes
  app.get("/api/notes", async (req, res) => {
    try {
      const notes = await storage.getAllNotes();
      res.json(notes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  // Get a specific note by ID
  app.get("/api/notes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const note = await storage.getNote(id);
      
      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }
      
      res.json(note);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch note" });
    }
  });

  // Create a new note
  app.post("/api/notes", async (req, res) => {
    try {
      const validatedData = insertNoteSchema.parse(req.body);
      const note = await storage.createNote(validatedData);
      res.status(201).json(note);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  // Update an existing note
  app.put("/api/notes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertNoteSchema.parse(req.body);
      const updatedNote = await storage.updateNote(id, validatedData);
      
      if (!updatedNote) {
        return res.status(404).json({ message: "Note not found" });
      }
      
      res.json(updatedNote);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  // Toggle favorite status
  app.patch("/api/notes/:id/favorite", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isFavorite } = req.body;
      
      const note = await storage.getNote(id);
      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }
      
      const updatedNote = await storage.updateNote(id, { 
        ...note,
        isFavorite: Boolean(isFavorite)
      });
      
      res.json(updatedNote);
    } catch (error) {
      res.status(500).json({ message: "Failed to update favorite status" });
    }
  });

  // Delete a note
  app.delete("/api/notes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteNote(id);
      
      if (!success) {
        return res.status(404).json({ message: "Note not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
