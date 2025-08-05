import { users, notes, type User, type InsertUser, type Note, type InsertNote } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Note methods
  getAllNotes(): Promise<Note[]>;
  getNote(id: number): Promise<Note | undefined>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: number, note: Partial<InsertNote>): Promise<Note | undefined>;
  deleteNote(id: number): Promise<boolean>;
}

// Database implementation
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Note methods
  async getAllNotes(): Promise<Note[]> {
    return await db.select().from(notes);
  }
  
  async getNote(id: number): Promise<Note | undefined> {
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    return note || undefined;
  }
  
  async createNote(insertNote: InsertNote): Promise<Note> {
    // Ensure all required fields are present
    const noteToInsert: InsertNote = {
      title: insertNote.title,
      content: insertNote.content,
      preview: insertNote.preview || null,
      recognizedText: insertNote.recognizedText || null,
      isFavorite: insertNote.isFavorite || false
    };
    
    const [note] = await db
      .insert(notes)
      .values(noteToInsert)
      .returning();
    return note;
  }
  
  async updateNote(id: number, updatedFields: Partial<InsertNote>): Promise<Note | undefined> {
    // First check if note exists
    const existingNote = await this.getNote(id);
    if (!existingNote) {
      return undefined;
    }
    
    // Ensure updatedAt is a proper Date
    const updateData = {
      ...updatedFields,
      updatedAt: new Date() as Date // Explicit cast to Date
    };
    
    const [updatedNote] = await db
      .update(notes)
      .set(updateData)
      .where(eq(notes.id, id))
      .returning();
    
    return updatedNote;
  }
  
  async deleteNote(id: number): Promise<boolean> {
    const result = await db
      .delete(notes)
      .where(eq(notes.id, id))
      .returning({ id: notes.id });
    
    return result.length > 0;
  }
}

// For backward compatibility, also include MemStorage
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private notesMap: Map<number, Note>;
  private userCurrentId: number;
  private noteCurrentId: number;

  constructor() {
    this.users = new Map();
    this.notesMap = new Map();
    this.userCurrentId = 1;
    this.noteCurrentId = 1;
    
    // Add a few sample notes for testing
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
      recognizedText: "Draw on the canvas and use the text recognition to convert your handwriting to text.",
      isFavorite: false,
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Note methods
  async getAllNotes(): Promise<Note[]> {
    return Array.from(this.notesMap.values()).sort((a, b) => {
      const bDate = b.updatedAt instanceof Date ? b.updatedAt : new Date(b.updatedAt || Date.now());
      const aDate = a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt || Date.now());
      return bDate.getTime() - aDate.getTime();
    });
  }
  
  async getNote(id: number): Promise<Note | undefined> {
    return this.notesMap.get(id);
  }
  
  async createNote(insertNote: InsertNote): Promise<Note> {
    const id = this.noteCurrentId++;
    const now = new Date();
    
    // Ensure all required fields are present and properly typed
    const note: Note = {
      id,
      title: insertNote.title,
      content: insertNote.content, 
      preview: insertNote.preview || null,
      recognizedText: insertNote.recognizedText || null,
      isFavorite: insertNote.isFavorite || false,
      createdAt: now,
      updatedAt: now
    };
    
    this.notesMap.set(id, note);
    return note;
  }
  
  async updateNote(id: number, updatedFields: Partial<InsertNote>): Promise<Note | undefined> {
    const existingNote = this.notesMap.get(id);
    
    if (!existingNote) {
      return undefined;
    }
    
    const updatedNote: Note = {
      ...existingNote,
      ...updatedFields,
      updatedAt: new Date()
    };
    
    this.notesMap.set(id, updatedNote);
    return updatedNote;
  }
  
  async deleteNote(id: number): Promise<boolean> {
    if (!this.notesMap.has(id)) {
      return false;
    }
    
    return this.notesMap.delete(id);
  }
}

// Use MemStorage instead of DatabaseStorage for now
export const storage = new MemStorage();
