import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Loader2, Mic, MicOff, Volume2 } from "lucide-react";
import { askAiQuestion, cleanupOcrText, getWritingSupport } from "@/lib/aiApi";
import { extractTextFromImageFile } from "@/lib/tesseract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type VoiceRecognitionCtor = new () => VoiceRecognition;

const WRITING_DEBOUNCE_MS = 700;

const AIAssistant = () => {
  const [question, setQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);

  const [writingInput, setWritingInput] = useState("");
  const [writingOutput, setWritingOutput] = useState("");
  const [writingTips, setWritingTips] = useState<string[]>([]);
  const [writingStatus, setWritingStatus] = useState<"idle" | "analyzing" | "updated" | "error">("idle");

  const [ocrRawText, setOcrRawText] = useState("");
  const [ocrCorrectedText, setOcrCorrectedText] = useState("");
  const [ocrStatus, setOcrStatus] = useState<"idle" | "recognizing" | "cleaning" | "done" | "error">("idle");
  const [ocrError, setOcrError] = useState("");

  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [autoSpeakVoiceAnswers, setAutoSpeakVoiceAnswers] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<VoiceRecognition | null>(null);

  const [ttsText, setTtsText] = useState("");
  const [ttsRate, setTtsRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [ttsStatus, setTtsStatus] = useState<"idle" | "speaking" | "paused">("idle");

  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const speechRecognitionCtor = useMemo(() => {
    if (typeof window === "undefined") return null;
    return ((window as unknown as { SpeechRecognition?: VoiceRecognitionCtor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: VoiceRecognitionCtor }).webkitSpeechRecognition ||
      null);
  }, []);

  useEffect(() => {
    if (!ttsSupported) return;
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      if (!voiceName && available.length > 0) {
        setVoiceName(available[0].name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [ttsSupported, voiceName]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!writingInput.trim()) {
        setWritingOutput("");
        setWritingTips([]);
        setWritingStatus("idle");
        return;
      }

      setWritingStatus("analyzing");
      try {
        const response = await getWritingSupport(writingInput);
        setWritingOutput(response.text);
        setWritingTips(response.suggestions);
        setWritingStatus("updated");
      } catch {
        setWritingStatus("error");
      }
    }, WRITING_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [writingInput]);

  const speakText = (text: string) => {
    if (!ttsSupported || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const selected = voices.find((voice) => voice.name === voiceName);
    if (selected) utterance.voice = selected;
    utterance.rate = ttsRate;
    utterance.onstart = () => setTtsStatus("speaking");
    utterance.onend = () => setTtsStatus("idle");
    utterance.onerror = () => setTtsStatus("idle");
    window.speechSynthesis.speak(utterance);
  };

  const handleAsk = async (customQuestion?: string) => {
    const value = (customQuestion ?? question).trim();
    if (!value) {
      setAskError("Please type a question.");
      return;
    }

    setAskError("");
    setAskLoading(true);
    try {
      const response = await askAiQuestion(
        value,
        history.flatMap((item) => [`Student: ${item.question}`, `Assistant: ${item.answer}`]),
      );
      setHistory((prev) => [...prev, { question: value, answer: response.text }].slice(-8));
      if (!customQuestion) setQuestion("");
      setTtsText(response.text);
      if (customQuestion && autoSpeakVoiceAnswers) {
        speakText(response.text);
      }
    } catch (error) {
      setAskError(error instanceof Error ? error.message : "Failed to get answer.");
    } finally {
      setAskLoading(false);
    }
  };

  const startVoiceCapture = () => {
    if (!speechRecognitionCtor) {
      setVoiceError("Voice input is not supported in this browser.");
      return;
    }

    setVoiceError("");
    const recognition = new speechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = async (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      setVoiceTranscript(transcript);
      if (!transcript) return;
      setVoiceLoading(true);
      await handleAsk(transcript);
      setVoiceLoading(false);
    };
    recognition.onerror = (event) => {
      setVoiceError(event.error ? `Voice error: ${event.error}` : "Could not capture voice.");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const stopVoiceCapture = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setOcrError("");
    setOcrRawText("");
    setOcrCorrectedText("");
    setOcrStatus("recognizing");

    try {
      const extracted = await extractTextFromImageFile(file);
      setOcrRawText(extracted.trim());
      if (!extracted.trim()) {
        setOcrStatus("error");
        setOcrError("No text found in the image.");
        return;
      }

      setOcrStatus("cleaning");
      const cleaned = await cleanupOcrText(extracted);
      setOcrCorrectedText(cleaned.text);
      setOcrStatus("done");
      setTtsText(cleaned.text);
    } catch (error) {
      setOcrStatus("error");
      setOcrError(error instanceof Error ? error.message : "Could not scan this image.");
    }
  };

  const togglePauseResume = () => {
    if (!ttsSupported) return;
    if (ttsStatus === "speaking") {
      window.speechSynthesis.pause();
      setTtsStatus("paused");
      return;
    }
    if (ttsStatus === "paused") {
      window.speechSynthesis.resume();
      setTtsStatus("speaking");
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-semibold">AI Writing Workspace</h2>
        <p className="mt-2 text-sm text-slate-600">Type in the top box. Corrected writing appears below automatically.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="writing-input">Your writing (top)</Label>
            <Textarea
              id="writing-input"
              value={writingInput}
              onChange={(event) => setWritingInput(event.target.value)}
              placeholder="Write here..."
              className="mt-2 min-h-44 text-base leading-8"
            />
          </div>
          <div>
            <Label htmlFor="writing-output">Corrected/predicted writing (bottom)</Label>
            <Textarea id="writing-output" value={writingOutput} readOnly className="mt-2 min-h-44 bg-slate-50 text-base leading-8" />
            <p className="mt-2 text-sm text-slate-600">
              Status:{" "}
              {writingStatus === "analyzing"
                ? "analyzing..."
                : writingStatus === "updated"
                  ? "updated"
                  : writingStatus === "error"
                    ? "error"
                    : "waiting for input"}
            </p>
            {writingTips.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {writingTips.slice(0, 3).map((tip, index) => (
                  <li key={`${tip}-${index}`}>{tip}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-xl font-semibold">Ask a question</h3>
        <div className="mt-3 flex gap-2">
          <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything..." />
          <Button onClick={() => handleAsk()} disabled={askLoading}>
            {askLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
          </Button>
        </div>
        {askError && <p className="mt-2 text-sm text-red-600">{askError}</p>}
        <div className="mt-4 space-y-3">
          {history.map((item, index) => (
            <div key={`${item.question}-${index}`} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Q: {item.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.answer}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-xl font-semibold">Voice AI Assistant</h3>
        <p className="mt-1 text-sm text-slate-600">Use your microphone to ask a question, then optionally hear the answer.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={isListening ? stopVoiceCapture : startVoiceCapture} variant={isListening ? "destructive" : "default"}>
            {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
            {isListening ? "Stop listening" : "Start listening"}
          </Button>
          <div className="flex items-center gap-2">
            <Switch id="auto-speak" checked={autoSpeakVoiceAnswers} onCheckedChange={setAutoSpeakVoiceAnswers} />
            <Label htmlFor="auto-speak">Read answers aloud</Label>
          </div>
          {(voiceLoading || isListening) && <span className="text-sm text-slate-600">{isListening ? "Listening..." : "Getting answer..."}</span>}
        </div>
        {voiceTranscript && <p className="mt-2 text-sm text-slate-700">Heard: {voiceTranscript}</p>}
        {voiceError && <p className="mt-2 text-sm text-red-600">{voiceError}</p>}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-xl font-semibold">Text scan (OCR) + correction</h3>
        <Input type="file" accept="image/*" onChange={handleImageUpload} className="mt-3" />
        <p className="mt-2 text-sm text-slate-600">
          {ocrStatus === "recognizing"
            ? "Reading image text..."
            : ocrStatus === "cleaning"
              ? "Cleaning OCR text with AI..."
              : ocrStatus === "done"
                ? "Done"
                : "Upload an image to start"}
        </p>
        {ocrError && <p className="mt-2 text-sm text-red-600">{ocrError}</p>}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <Label>Raw OCR text</Label>
            <Textarea value={ocrRawText} readOnly className="mt-2 min-h-36 bg-slate-50" />
            <Button className="mt-2" variant="outline" onClick={() => navigator.clipboard.writeText(ocrRawText)} disabled={!ocrRawText}>
              Copy raw text
            </Button>
          </div>
          <div>
            <Label>Corrected text</Label>
            <Textarea value={ocrCorrectedText} readOnly className="mt-2 min-h-36 bg-slate-50" />
            <Button className="mt-2" variant="outline" onClick={() => navigator.clipboard.writeText(ocrCorrectedText)} disabled={!ocrCorrectedText}>
              Copy corrected text
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="flex items-center gap-2 text-xl font-semibold">
          <Volume2 className="h-5 w-5" />
          Read aloud
        </h3>
        {!ttsSupported && <p className="mt-2 text-sm text-amber-700">Text-to-speech is not supported in this browser.</p>}
        <Textarea
          value={ttsText}
          onChange={(event) => setTtsText(event.target.value)}
          className="mt-3 min-h-28"
          placeholder="Paste or generate text to read aloud..."
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Label>Speed ({ttsRate.toFixed(1)}x)</Label>
            <Slider min={0.6} max={1.8} step={0.1} value={[ttsRate]} onValueChange={(value) => setTtsRate(value[0])} />
          </div>
          <div>
            <Label htmlFor="voice-select">Voice</Label>
            <select
              id="voice-select"
              value={voiceName}
              onChange={(event) => setVoiceName(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => speakText(ttsText)} disabled={!ttsSupported || !ttsText.trim()}>
            Play
          </Button>
          <Button variant="outline" onClick={togglePauseResume} disabled={!ttsSupported || ttsStatus === "idle"}>
            {ttsStatus === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!ttsSupported) return;
              window.speechSynthesis.cancel();
              setTtsStatus("idle");
            }}
            disabled={!ttsSupported}
          >
            Stop
          </Button>
        </div>
      </div>
    </section>
  );
};

export default AIAssistant;
