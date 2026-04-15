import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import ReadingFlowCanvas from "@/components/ReadingFlowCanvas";

interface AnalysisAnnotation {
  word: string;
  start: number;
  end: number;
  confidence: number;
  issueType: "spelling" | "readability" | "pattern";
  explanation: string;
  recommendation: string;
}

interface AnalysisPayload {
  analyzedAt: string;
  cached: boolean;
  analysis: {
    normalizedText: string;
    confidenceThreshold: number;
    readabilityScore: number;
    modelAccuracyEstimate: number;
    annotations: AnalysisAnnotation[];
    recommendations: string[];
  };
  externalSuggestions: Record<string, string[]>;
}

const AnalyzeText = () => {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(55);
  const [useDictionary, setUseDictionary] = useState(false);
  const [fontSize, setFontSize] = useState(24);
  const [wordSpacing, setWordSpacing] = useState(12);
  const [lineHeight, setLineHeight] = useState(38);
  const [backgroundColor, setBackgroundColor] = useState("#f8fafc");

  const cacheRef = useRef<Map<string, AnalysisPayload>>(new Map());
  const debounceRef = useRef<number>();

  const cacheKey = useMemo(
    () => JSON.stringify({ text, threshold, useDictionary }),
    [text, threshold, useDictionary],
  );

  useEffect(() => {
    window.clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setAnalysis(null);
      setProgress(0);
      setLoading(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      if (cacheRef.current.has(cacheKey)) {
        const cached = cacheRef.current.get(cacheKey)!;
        setAnalysis(cached);
        setLastAnalyzedAt(cached.analyzedAt);
        setProgress(100);
        return;
      }

      setLoading(true);
      setProgress(20);
      const interval = window.setInterval(() => {
        setProgress((prev) => (prev < 85 ? prev + 8 : prev));
      }, 120);

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            minConfidence: threshold / 100,
            includeExternalSuggestions: useDictionary,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to analyze text");
        }

        const payload = (await response.json()) as AnalysisPayload;
        cacheRef.current.set(cacheKey, payload);
        setAnalysis(payload);
        setLastAnalyzedAt(payload.analyzedAt);
        setProgress(100);
      } catch {
        setAnalysis(null);
        setProgress(0);
      } finally {
        window.clearInterval(interval);
        setLoading(false);
      }
    }, 700);

    return () => window.clearTimeout(debounceRef.current);
  }, [cacheKey, text, threshold, useDictionary]);

  const highlightedText = useMemo(() => {
    if (!analysis || !analysis.analysis.annotations.length) return text;

    const segments: Array<{ value: string; flagged: boolean; id: string }> = [];
    let cursor = 0;

    analysis.analysis.annotations
      .slice()
      .sort((a, b) => a.start - b.start)
      .forEach((annotation, index) => {
        if (annotation.start > cursor) {
          segments.push({ value: text.slice(cursor, annotation.start), flagged: false, id: `plain-${index}` });
        }
        segments.push({ value: text.slice(annotation.start, annotation.end), flagged: true, id: `flag-${annotation.start}-${annotation.end}-${index}` });
        cursor = annotation.end;
      });

    if (cursor < text.length) {
      segments.push({ value: text.slice(cursor), flagged: false, id: "plain-tail" });
    }

    return segments;
  }, [analysis, text]);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl bg-white/95 p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-semibold">Analyze Text</h2>
        <p className="mt-2 text-sm text-slate-600">Type or paste text and analysis runs automatically after a short pause.</p>

        <div className="mt-4">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-40 text-base leading-8"
            placeholder="Paste text here for automatic dyslexia-aware analysis..."
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <Label>Confidence threshold ({threshold}%)</Label>
            <Slider value={[threshold]} min={35} max={90} step={1} onValueChange={(value) => setThreshold(value[0])} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
            <Label htmlFor="dictionary">Use free dictionary suggestions</Label>
            <Switch id="dictionary" checked={useDictionary} onCheckedChange={setUseDictionary} />
          </div>

          <div className="text-sm text-slate-600">
            {lastAnalyzedAt ? `Last analyzed: ${new Date(lastAnalyzedAt).toLocaleTimeString()}` : "No analysis yet"}
          </div>
        </div>

        {loading && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Running model...
            </div>
            <Progress value={progress} />
          </div>
        )}
      </div>

      {analysis && (
        <div className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="font-semibold">Explainability</h3>
            <div className="mt-3 rounded-lg bg-slate-50 p-4 whitespace-pre-wrap leading-8">
              {Array.isArray(highlightedText)
                ? highlightedText.map((segment) =>
                    segment.flagged ? (
                      <mark key={segment.id} className="rounded bg-amber-200 px-1 text-slate-900">{segment.value}</mark>
                    ) : (
                      <span key={segment.id}>{segment.value}</span>
                    ),
                  )
                : highlightedText}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {analysis.analysis.annotations.map((annotation, index) => (
                <li key={`${annotation.start}-${annotation.end}-${index}`} className="rounded border border-slate-200 p-3">
                  <div className="font-medium">{annotation.word} · {Math.round(annotation.confidence * 100)}%</div>
                  <div className="text-slate-600">{annotation.explanation}</div>
                  <div className="text-blue-700">{annotation.recommendation}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-semibold">Scores</h3>
              <p className="mt-3 text-sm">Readability: <strong>{analysis.analysis.readabilityScore}</strong></p>
              <p className="text-sm">Estimated accuracy: <strong>{analysis.analysis.modelAccuracyEstimate}%</strong></p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-semibold">Canvas preview tools</h3>
              <div className="mt-3 grid gap-3 text-sm">
                <Label>Font size</Label>
                <Slider value={[fontSize]} min={16} max={36} step={1} onValueChange={(value) => setFontSize(value[0])} />
                <Label>Word spacing</Label>
                <Slider value={[wordSpacing]} min={6} max={28} step={1} onValueChange={(value) => setWordSpacing(value[0])} />
                <Label>Line height</Label>
                <Slider value={[lineHeight]} min={28} max={56} step={1} onValueChange={(value) => setLineHeight(value[0])} />
                <Label htmlFor="bgColor">Background</Label>
                <input id="bgColor" type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} className="h-9 w-14 rounded border" />
              </div>
              <div className="mt-4">
                <ReadingFlowCanvas
                  text={analysis.analysis.normalizedText || text}
                  fontSize={fontSize}
                  wordSpacing={wordSpacing}
                  lineHeight={lineHeight}
                  backgroundColor={backgroundColor}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AnalyzeText;
