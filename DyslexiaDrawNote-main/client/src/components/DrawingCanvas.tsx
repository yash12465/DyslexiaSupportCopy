import React, { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import ColorPicker from "./ColorPicker";
import PenSizePicker from "./PenSizePicker";
import { HistoryItem } from "@/lib/utils";
import {
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Type,
  Shapes,
  Edit3,
  Pen,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface DrawingCanvasProps {
  initialContent?: string;
  onContentChange?: (content: string) => void;
  onStrokeDataChange?: (strokeData: StrokePoint[]) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  backgroundStyle?: "blank" | "lined" | "graph";
  lineSpacing?: "single" | "wide" | "college";
  enableShapeCorrection?: boolean;
  enableInstantCorrection?: boolean;
  mode?: "free" | "notebook" | "training";
}

interface Point {
  x: number;
  y: number;
  pressure?: number;
}

interface StrokePoint {
  x: number;
  y: number;
  time: number;
  pen_down: boolean;
  pressure?: number;
  stroke_id?: string;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  initialContent,
  onContentChange,
  onStrokeDataChange,
  onCanvasReady,
  backgroundStyle = "blank",
  lineSpacing = "single",
  enableShapeCorrection = false,
  enableInstantCorrection = false,
  mode = "free",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  // UI state (kept so UI updates still happen)
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<
    "pen" | "eraser" | "stylus"
  >("pen");
  const [penColor, setPenColor] = useState("#000000");
  const [penSize, setPenSize] = useState(2);
  const [lastPosition, setLastPosition] = useState<Point>({ x: 0, y: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isPenTabletDetected, setIsPenTabletDetected] = useState(false);

  // Stroke tracking UI state
  const [allStrokes, setAllStrokes] = useState<StrokePoint[]>([]);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const [strokeStartTime, setStrokeStartTime] = useState<number>(0);
  const [currentStrokeId, setCurrentStrokeId] = useState<string>("");

  // Refs for mutable state used in native event handlers (fix stale closures)
  const isDrawingRef = useRef(false);
  const lastPositionRef = useRef<Point>({ x: 0, y: 0 });
  const currentStrokeRef = useRef<StrokePoint[]>([]);
  const allStrokesRef = useRef<StrokePoint[]>([]);
  const currentToolRef = useRef(currentTool);
  const penColorRef = useRef(penColor);
  const penSizeRef = useRef(penSize);
  const strokeStartTimeRef = useRef(strokeStartTime);

  // Sync helpers (keep state + ref consistent)
  const setIsDrawingAndRef = (v: boolean) => {
    isDrawingRef.current = v;
    setIsDrawing(v);
  };
  const setLastPositionAndRef = (p: Point) => {
    lastPositionRef.current = p;
    setLastPosition(p);
  };
  const setCurrentStrokeAndRef = (s: StrokePoint[]) => {
    currentStrokeRef.current = s;
    setCurrentStroke(s);
  };
  const setAllStrokesAndRef = (s: StrokePoint[]) => {
    allStrokesRef.current = s;
    setAllStrokes(s);
  };
  const setCurrentToolAndRef = (t: "pen" | "eraser" | "stylus") => {
    currentToolRef.current = t;
    setCurrentTool(t);
  };
  const setPenColorAndRef = (c: string) => {
    penColorRef.current = c;
    setPenColor(c);
  };
  const setPenSizeAndRef = (s: number) => {
    penSizeRef.current = s;
    setPenSize(s);
  };
  const setStrokeStartTimeAndRef = (t: number) => {
    strokeStartTimeRef.current = t;
    setStrokeStartTime(t);
  };

  // Shape detection
  const [currentShape, setCurrentShape] = useState<{
    type: "line" | "rectangle" | "circle" | "none";
    startPoint: Point | null;
    points: Point[];
  }>({
    type: "none",
    startPoint: null,
    points: [],
  });

  // Background drawing
  const drawLinedPaper = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    ctx.save();
    let lineSpacingPx = 30;
    if (lineSpacing === "wide") lineSpacingPx = 45;
    else if (lineSpacing === "college") lineSpacingPx = 25;

    ctx.beginPath();
    ctx.strokeStyle = "#e6e6ff";
    ctx.lineWidth = 1;

    for (let y = lineSpacingPx; y < height; y += lineSpacingPx) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }

    if (mode === "notebook") {
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = "#ffcccc";
      ctx.lineWidth = 1;
      ctx.moveTo(40, 0);
      ctx.lineTo(40, height);
    }

    ctx.stroke();
    ctx.restore();
  };

  const drawGraphPaper = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    ctx.save();
    const gridSize = 20;

    ctx.beginPath();
    ctx.strokeStyle = "#e6e6e6";
    ctx.lineWidth = 0.5;

    for (let x = gridSize; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = gridSize; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;
    for (let x = gridSize * 5; x < width; x += gridSize * 5) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = gridSize * 5; y < height; y += gridSize * 5) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const drawCanvasBackground = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    switch (backgroundStyle) {
      case "lined":
        drawLinedPaper(ctx, canvas.width, canvas.height);
        break;
      case "graph":
        drawGraphPaper(ctx, canvas.width, canvas.height);
        break;
      case "blank":
      default:
        break;
    }
  };

  // Core drawing utilities — use refs inside so handlers use latest values
  const configureContext = (ctx: CanvasRenderingContext2D) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const tool = currentToolRef.current;
    const color = penColorRef.current;
    const size = penSizeRef.current;

    switch (tool) {
      case "pen":
      case "stylus":
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = size;
        ctx.globalCompositeOperation = "source-over";
        break;
      case "eraser":
        ctx.strokeStyle = "#ffffff";
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = size * 2;
        ctx.globalCompositeOperation = "destination-out";
        break;
    }
  };

  const getAdjustedPenSize = (pressure: number = 1): number => {
    if (currentToolRef.current === "stylus") {
      const minFactor = 0.5;
      const maxFactor = 2.0;
      const factor = minFactor + pressure * (maxFactor - minFactor);
      return penSizeRef.current * factor;
    }
    return penSizeRef.current;
  };

  const drawPoint = (ctx: CanvasRenderingContext2D, point: Point) => {
    configureContext(ctx);
    ctx.beginPath();
    ctx.arc(point.x, point.y, getAdjustedPenSize(point.pressure) / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawLine = (ctx: CanvasRenderingContext2D, from: Point, to: Point) => {
    configureContext(ctx);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    if (currentToolRef.current === "stylus" && to.pressure !== undefined) {
      ctx.lineWidth = getAdjustedPenSize(to.pressure);
    }
    ctx.stroke();
  };

  // Stroke helpers
  const createStrokePoint = (x: number, y: number, penDown: boolean, pressure?: number): StrokePoint => {
    const now = Date.now();
    return {
      x,
      y,
      time: strokeStartTimeRef.current > 0 ? now - strokeStartTimeRef.current : 0,
      pen_down: penDown,
      pressure: pressure || 1,
      stroke_id: currentStrokeId,
    };
  };

  // History management
  const saveHistoryState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Truncate future history if we aren't at the end
    if (historyIndex < history.length - 1) {
      setHistory(prev => prev.slice(0, historyIndex + 1));
    }

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory(prev => {
        const next = [...prev, { imageData }];
        setHistoryIndex(next.length - 1);
        return next;
      });
      if (onContentChange) onContentChange(canvas.toDataURL());
    } catch (err) {
      console.warn("Unable to save history state:", err);
    }
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    ctx.putImageData(history[newIndex].imageData, 0, 0);
    if (onContentChange) onContentChange(canvas.toDataURL());
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    ctx.putImageData(history[newIndex].imageData, 0, 0);
    if (onContentChange) onContentChange(canvas.toDataURL());
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setAllStrokesAndRef([]);
    setCurrentStrokeAndRef([]);
    if (onStrokeDataChange) onStrokeDataChange([]);
    drawCanvasBackground();
    saveHistoryState();
  };

  // Shape correction (simple)
  const detectAndCorrectShape = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (historyIndex < 0 || !history[historyIndex]) return;

    const startX = currentShape.startPoint?.x || 0;
    const startY = currentShape.startPoint?.y || 0;
    const endX = lastPositionRef.current.x;
    const endY = lastPositionRef.current.y;

    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    if (distance > 20) {
      const isHorizontal = Math.abs(endY - startY) < 15;
      const isVertical = Math.abs(endX - startX) < 15;

      if (isHorizontal || isVertical) {
        if (historyIndex > 0) ctx.putImageData(history[historyIndex - 1].imageData, 0, 0);
        else { ctx.clearRect(0, 0, canvas.width, canvas.height); drawCanvasBackground(); }

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = penColorRef.current;
        ctx.lineWidth = penSizeRef.current;
        if (isHorizontal) ctx.moveTo(startX, startY), ctx.lineTo(endX, startY);
        else ctx.moveTo(startX, startY), ctx.lineTo(startX, endY);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Setup event handlers (mounted once)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const prevDataUrl = canvas.toDataURL();
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        if (historyIndex < 0) {
          drawCanvasBackground();
          saveHistoryState();
        }
      };
      img.src = prevDataUrl;

      if (historyIndex >= 0 && history[historyIndex]) {
        try { ctx.putImageData(history[historyIndex].imageData, 0, 0); } catch { /* ignore */ }
      }
    };

    // Apply initial background or initialContent
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    if (initialContent) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          saveHistoryState();
        }
      };
      img.src = initialContent;
    } else {
      drawCanvasBackground();
      if (historyIndex < 0) saveHistoryState();
    }

    // Pen detection
    const detectPenTablet = (e: PointerEvent) => {
      if (e.pointerType === "pen") {
        setIsPenTabletDetected(true);
        setCurrentToolAndRef("stylus");
        window.removeEventListener("pointerdown", detectPenTablet);
      }
    };

    // Touch handlers
    let touchDrawing = false;
    let touchLastPoint: Point | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const point: Point = { x: touch.clientX - rect.left, y: touch.clientY - rect.top, pressure: 1 };

      touchDrawing = true;
      touchLastPoint = point;

      const newStrokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentStrokeId(newStrokeId);
      setStrokeStartTimeAndRef(Date.now());

      const strokePoint = createStrokePoint(point.x, point.y, true, point.pressure);
      setCurrentStrokeAndRef([strokePoint]);

      const ctx = canvas.getContext("2d");
      if (ctx) { configureContext(ctx); ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x, point.y); ctx.stroke(); }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!touchDrawing || !touchLastPoint) return;
      const touch = e.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const currentPoint: Point = { x: touch.clientX - rect.left, y: touch.clientY - rect.top, pressure: 1 };

      const strokePoint = createStrokePoint(currentPoint.x, currentPoint.y, true, currentPoint.pressure);
      setCurrentStrokeAndRef([...currentStrokeRef.current, strokePoint]);

      const ctx = canvas.getContext("2d");
      if (ctx) {
        configureContext(ctx);
        ctx.beginPath();
        ctx.moveTo(touchLastPoint.x, touchLastPoint.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
        touchLastPoint = currentPoint;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (touchDrawing) {
        touchDrawing = false;
        if (touchLastPoint) {
          const finalStrokePoint = createStrokePoint(touchLastPoint.x, touchLastPoint.y, false, 1);
          const updatedStroke = [...currentStrokeRef.current, finalStrokePoint];
          const newAllStrokes = [...allStrokesRef.current, ...updatedStroke];
          setAllStrokesAndRef(newAllStrokes);
          if (onStrokeDataChange) onStrokeDataChange(newAllStrokes);
        }
        touchLastPoint = null;
        setCurrentStrokeAndRef([]);
        saveHistoryState();
      }
    };

    // Pointer handlers (stylus + mouse modern browsers)
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;

      setIsDrawingAndRef(true);
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}

      const rect = canvasEl.getBoundingClientRect();
      const point: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 1 };

      if (e.pointerType === "pen" && currentToolRef.current !== "eraser") setCurrentToolAndRef("stylus");

      const newStrokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentStrokeId(newStrokeId);
      setStrokeStartTimeAndRef(Date.now());

      const strokePoint = createStrokePoint(point.x, point.y, true, point.pressure);
      setCurrentStrokeAndRef([strokePoint]);

      if (enableShapeCorrection && mode === "free") {
        setCurrentShape({ type: "none", startPoint: point, points: [point] });
      }

      setLastPositionAndRef(point);

      const ctx = canvas.getContext("2d");
      if (ctx) { configureContext(ctx); ctx.beginPath(); drawPoint(ctx, point); }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (!isDrawingRef.current) return;
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const ctx = canvasEl.getContext("2d");
      if (!ctx) return;

      const rect = canvasEl.getBoundingClientRect();
      const point: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 1 };

      const strokePoint = createStrokePoint(point.x, point.y, true, point.pressure);
      setCurrentStrokeAndRef([...currentStrokeRef.current, strokePoint]);

      if (enableShapeCorrection && mode === "free") {
        setCurrentShape(prev => ({ ...prev, points: [...prev.points, point] }));
      }

      configureContext(ctx);
      drawLine(ctx, lastPositionRef.current, point);
      setLastPositionAndRef(point);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (isDrawingRef.current) {
        try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {}

        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const finalPoint: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 1 };
          const finalStrokePoint = createStrokePoint(finalPoint.x, finalPoint.y, false, finalPoint.pressure);
          const updatedStroke = [...currentStrokeRef.current, finalStrokePoint];
          const newAllStrokes = [...allStrokesRef.current, ...updatedStroke];
          setAllStrokesAndRef(newAllStrokes);
          if (onStrokeDataChange) onStrokeDataChange(newAllStrokes);
        }

        if (enableShapeCorrection && mode === "free") detectAndCorrectShape();

        setIsDrawingAndRef(false);
        setCurrentStrokeAndRef([]);
        saveHistoryState();
      }
    };

    // Mouse fallback handlers
    const startDrawing = (e: MouseEvent) => {
      setIsDrawingAndRef(true);
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const x = (e as any).clientX - rect.left;
      const y = (e as any).clientY - rect.top;

      const newStrokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentStrokeId(newStrokeId);
      setStrokeStartTimeAndRef(Date.now());

      const strokePoint = createStrokePoint(x, y, true, 1);
      setCurrentStrokeAndRef([strokePoint]);

      setLastPositionAndRef({ x, y });
      const ctx = canvasEl.getContext("2d");
      if (ctx) { configureContext(ctx); ctx.beginPath(); ctx.arc(x, y, penSizeRef.current / 2, 0, Math.PI * 2); ctx.fill(); }
    };

    const draw = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const ctx = canvasEl.getContext("2d");
      if (!ctx) return;
      const rect = canvasEl.getBoundingClientRect();
      const x = (e as any).clientX - rect.left;
      const y = (e as any).clientY - rect.top;

      const strokePoint = createStrokePoint(x, y, true, 1);
      setCurrentStrokeAndRef([...currentStrokeRef.current, strokePoint]);
      drawLine(ctx, lastPositionRef.current, { x, y });
      setLastPositionAndRef({ x, y });
    };

    const stopDrawing = () => {
      if (isDrawingRef.current) {
        const finalStrokePoint = createStrokePoint(lastPositionRef.current.x, lastPositionRef.current.y, false, 1);
        const updatedStroke = [...currentStrokeRef.current, finalStrokePoint];
        const newAllStrokes = [...allStrokesRef.current, ...updatedStroke];
        setAllStrokesAndRef(newAllStrokes);
        if (onStrokeDataChange) onStrokeDataChange(newAllStrokes);

        setIsDrawingAndRef(false);
        setCurrentStrokeAndRef([]);
        saveHistoryState();
      }
    };

    // Attach listeners
    try {
      canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
      canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
      canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
      canvas.addEventListener("touchcancel", handleTouchEnd, { passive: false });

      if (!("ontouchstart" in window)) {
        canvas.addEventListener("pointerdown", handlePointerDown);
        canvas.addEventListener("pointermove", handlePointerMove);
        canvas.addEventListener("pointerup", handlePointerUp);
        canvas.addEventListener("pointerout", handlePointerUp);
        canvas.addEventListener("pointercancel", handlePointerUp);
        window.addEventListener("pointerdown", detectPenTablet);
      }

      canvas.addEventListener("mousedown", startDrawing as any);
      window.addEventListener("mousemove", draw as any);
      window.addEventListener("mouseup", stopDrawing as any);

      // style adjustments (use setProperty for vendor prefixes)
      canvas.style.touchAction = "none";
      canvas.style.userSelect = "none";
      canvas.style.setProperty("-webkit-user-select", "none");
      canvas.style.setProperty("-webkit-touch-callout", "none");
      canvas.style.setProperty("-webkit-user-drag", "none");
    } catch (err) {
      console.warn("Event listeners may not be fully supported:", err);
    }

    if (onCanvasReady) onCanvasReady(canvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      try {
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
        canvas.removeEventListener("pointerout", handlePointerUp);
        canvas.removeEventListener("pointercancel", handlePointerUp);
        canvas.removeEventListener("touchstart", handleTouchStart);
        canvas.removeEventListener("touchmove", handleTouchMove);
        canvas.removeEventListener("touchend", handleTouchEnd);
        canvas.removeEventListener("touchcancel", handleTouchEnd);
        window.removeEventListener("pointerdown", detectPenTablet);
        canvas.removeEventListener("mousedown", startDrawing as any);
        window.removeEventListener("mousemove", draw as any);
        window.removeEventListener("mouseup", stopDrawing as any);
      } catch (err) {
        console.warn("Error cleaning up listeners:", err);
      }
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep refs in sync if external UI changes them
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { penColorRef.current = penColor; }, [penColor]);
  useEffect(() => { penSizeRef.current = penSize; }, [penSize]);
  useEffect(() => { strokeStartTimeRef.current = strokeStartTime; }, [strokeStartTime]);

  // UI handlers
  const handleToolChange = (tool: "pen" | "eraser" | "stylus") => setCurrentToolAndRef(tool);
  const handleColorChange = (color: string) => {
    setPenColorAndRef(color);
    if (currentToolRef.current === "eraser") setCurrentToolAndRef(isPenTabletDetected ? "stylus" : "pen");
  };
  const handleSizeChange = (size: number) => setPenSizeAndRef(size);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-md p-3 mb-4 flex flex-wrap items-center justify-between">
        <div className="flex items-center space-x-2 mb-2 md:mb-0">
          <div className="border-r pr-2 mr-2">
            <PenSizePicker onSizeChange={handleSizeChange} defaultSize={penSize} />
          </div>
          <ColorPicker onColorChange={handleColorChange} defaultColor={penColor} />
        </div>

        {isPenTabletDetected && (
          <Badge variant="outline" className="bg-green-50 text-green-700 mr-2">Pen Tablet Detected</Badge>
        )}

        <div className="flex items-center space-x-3">
          <Button
            variant={(currentTool === "pen" || currentTool === "stylus") ? "secondary" : "outline"}
            size="icon"
            onClick={() => handleToolChange(isPenTabletDetected ? "stylus" : "pen")}
            title={isPenTabletDetected ? "Stylus" : "Pen"}
          >
            {isPenTabletDetected ? <Edit3 className="h-5 w-5" /> : <Pen className="h-5 w-5" />}
          </Button>

          <Button
            variant={currentTool === "eraser" ? "secondary" : "outline"}
            size="icon"
            onClick={() => handleToolChange("eraser")}
            title="Eraser"
          >
            <Eraser className="h-5 w-5" />
          </Button>

          <Button variant="outline" size="icon" title="Text Tool"><Type className="h-5 w-5" /></Button>
          <Button variant="outline" size="icon" title="Shapes"><Shapes className="h-5 w-5" /></Button>

          <Separator orientation="vertical" className="h-8" />

          <Button variant="outline" size="icon" onClick={handleUndo} disabled={historyIndex <= 0} title="Undo"><Undo2 className="h-5 w-5" /></Button>
          <Button variant="outline" size="icon" onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Redo"><Redo2 className="h-5 w-5" /></Button>

          <Separator orientation="vertical" className="h-8" />

          <Button variant="outline" size="icon" onClick={handleClear} title="Clear Canvas"><Trash2 className="h-5 w-5" /></Button>
        </div>
      </div>

      <div ref={canvasContainerRef} className="bg-white rounded-lg shadow-lg p-1 overflow-hidden canvas-container" style={{ height: "70vh" }}>
        <canvas ref={canvasRef} className="w-full border border-gray-200 rounded-lg bg-white" style={{ touchAction: "none" }} />
      </div>
    </div>
  );
};

export default DrawingCanvas;
