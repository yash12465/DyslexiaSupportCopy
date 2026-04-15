import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import NoteCard from "@/components/NoteCard";
import type { Note } from "@shared/schema";

const Home = () => {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const { data: notes, isLoading } = useQuery<Note[]>({ queryKey: ["/api/notes"] });

  const filtered = useMemo(() => {
    if (!notes) return [];

    return [...notes]
      .sort((a, b) => {
        const bDate = b.updatedAt ?? b.createdAt ?? new Date();
        const aDate = a.updatedAt ?? a.createdAt ?? new Date();
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      })
      .filter((note) => {
        if (!query) return true;
        const lowered = query.toLowerCase();
        return note.title.toLowerCase().includes(lowered) || (note.recognizedText || "").toLowerCase().includes(lowered);
      });
  }, [notes, query]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-600 p-8 text-white shadow-lg">
        <h2 className="text-3xl font-bold">Dyslexia Support, now automatic</h2>
        <p className="mt-3 max-w-2xl text-blue-100 leading-7">
          Analyze text in real time, visualize reading flow on canvas, and fine-tune dyslexia-friendly formatting with built-in accessibility controls.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button className="bg-white text-blue-700 hover:bg-blue-50" onClick={() => navigate("/analyze")}>Analyze Text</Button>
          <Button variant="outline" className="border-white/60 text-white hover:bg-white/10" onClick={() => navigate("/tools")}>Open Tools</Button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-xl font-semibold">Notes</h3>
          <div className="flex w-full gap-2 md:w-auto">
            <div className="relative min-w-72 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search notes" />
            </div>
            <Button onClick={() => navigate("/note")}><Plus className="mr-1 h-4 w-4" />New</Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-xl" />)
            : filtered.map((note) => <NoteCard key={note.id} note={note} />)}
        </div>
      </section>
    </div>
  );
};

export default Home;
