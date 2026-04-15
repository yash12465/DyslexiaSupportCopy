import { useEffect, useMemo, useRef } from "react";

interface ReadingFlowCanvasProps {
  text: string;
  fontSize: number;
  wordSpacing: number;
  lineHeight: number;
  backgroundColor: string;
}

const splitSyllables = (word: string) => {
  const parts = word.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy](?=$|[^aeiouy]))?/gi);
  return parts && parts.length ? parts : [word];
};

const ReadingFlowCanvas = ({ text, fontSize, wordSpacing, lineHeight, backgroundColor }: ReadingFlowCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean).slice(0, 120), [text]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parentWidth = canvas.parentElement?.clientWidth ?? 900;
    canvas.width = Math.max(parentWidth, 360);
    canvas.height = 300;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${fontSize}px OpenDyslexic, Arial, sans-serif`;
    ctx.fillStyle = "#111827";

    let x = 24;
    let y = 40;
    const maxWidth = canvas.width - 24;

    for (const word of words) {
      const width = ctx.measureText(word).width;
      if (x + width > maxWidth) {
        x = 24;
        y += lineHeight;
      }

      const chunks = splitSyllables(word);
      let chunkX = x;

      chunks.forEach((chunk, index) => {
        ctx.fillStyle = index % 2 === 0 ? "#111827" : "#2563eb";
        ctx.fillText(chunk, chunkX, y);
        chunkX += ctx.measureText(chunk).width;
      });

      ctx.strokeStyle = "#93c5fd";
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x + width, y + 8);
      ctx.stroke();

      x += width + wordSpacing;
      if (y > canvas.height - 20) break;
    }
  }, [words, fontSize, wordSpacing, lineHeight, backgroundColor]);

  return <canvas ref={canvasRef} className="w-full rounded-xl border border-slate-200" aria-label="Reading flow preview" />;
};

export default ReadingFlowCanvas;
