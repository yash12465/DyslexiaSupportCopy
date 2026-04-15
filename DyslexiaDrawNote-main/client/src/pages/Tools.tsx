import { FormEvent, useState } from "react";

const resources = [
  { name: "OpenDyslexic Font", url: "https://opendyslexic.org/", description: "Free dyslexia-friendly font." },
  { name: "BeeLine Reader (free tier)", url: "https://www.beelinereader.com/", description: "Color-gradient reading helper." },
  { name: "NHS Dyslexia Support", url: "https://www.nhs.uk/conditions/dyslexia/", description: "Practical support and guidance." },
  { name: "Reading Rockets", url: "https://www.readingrockets.org/topics/dyslexia", description: "Free dyslexia learning resources." },
];

const Tools = () => {
  const [word, setWord] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleLookup = async (event: FormEvent) => {
    event.preventDefault();
    if (!word.trim()) return;

    const response = await fetch(`/api/dictionary?word=${encodeURIComponent(word.trim())}`);
    if (!response.ok) {
      setSuggestions([]);
      return;
    }

    const payload = (await response.json()) as { suggestions: string[] };
    setSuggestions(payload.suggestions || []);
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-semibold">Tools & Free Resources</h2>
        <p className="mt-2 text-sm text-slate-600">Free support resources plus no-key dictionary/thesaurus helper.</p>
      </div>

      <form onSubmit={handleLookup} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <label className="text-sm font-medium">Dictionary lookup</label>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder="Enter a word"
          />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white">Find</button>
        </div>
        {suggestions.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((item) => (
              <li key={item} className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-900">{item}</li>
            ))}
          </ul>
        )}
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {resources.map((resource) => (
          <a key={resource.name} href={resource.url} target="_blank" rel="noreferrer" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-blue-300">
            <h3 className="font-semibold">{resource.name}</h3>
            <p className="mt-1 text-sm text-slate-600">{resource.description}</p>
          </a>
        ))}
      </div>
    </section>
  );
};

export default Tools;
