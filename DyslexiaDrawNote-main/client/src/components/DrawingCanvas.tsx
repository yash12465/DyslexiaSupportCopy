import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import ColorPicker from './ColorPicker';
import PenSizePicker from './PenSizePicker';
import { HistoryItem, createEmptyImageData } from '@/lib/utils';
import { 
  Eraser, 
  Undo2, 
  Redo2, 
  Trash2, 
  Type,
  Shapes,
  Edit3,
  Pen
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface DrawingCanvasProps {
  initialContent?: string;
  onContentChange?: (content: string) => void;
  onStrokeDataChange?: (strokeData: StrokePoint[]) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  backgroundStyle?: 'blank' | 'lined' | 'graph';
  lineSpacing?: 'single' | 'wide' | 'college';
  enableShapeCorrection?: boolean;
  enableInstantCorrection?: boolean;
  mode?: 'free' | 'notebook' | 'training';
}

interface Point {
  x: number;
  y: number;
  pressure?: number; // For pen pressure sensitivity
}

interface StrokePoint {
  x: number;
  y: number;
  time: number;
  pen_down: boolean;
  pressure?: number;
  stroke_id?: string;
}

interface StrokeData {
  points: StrokePoint[];
  startTime: number;
}

const DrawingCanvas = ({ 
  initialContent,
  onContentChange,
  onStrokeDataChange,
  onCanvasReady,
  backgroundStyle = 'blank',
  lineSpacing = 'single',
  enableShapeCorrection = false,
  enableInstantCorrection = false,
  mode = 'free'
}: DrawingCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser' | 'stylus'>('pen');
  const [penColor, setPenColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);
  const [lastPosition, setLastPosition] = useState<Point>({ x: 0, y: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isPenTabletDetected, setIsPenTabletDetected] = useState(false);
  
  // Stroke tracking state
  const [allStrokes, setAllStrokes] = useState<StrokePoint[]>([]);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const [strokeStartTime, setStrokeStartTime] = useState<number>(0);
  const [currentStrokeId, setCurrentStrokeId] = useState<string>('');
  
  // State for detecting and auto-correcting shapes
  const [currentShape, setCurrentShape] = useState<{
    type: 'line' | 'rectangle' | 'circle' | 'none';
    startPoint: Point | null;
    points: Point[];
  }>({
    type: 'none',
    startPoint: null,
    points: []
  });
  
  // Draw lined paper background
  const drawLinedPaper = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    
    // Line spacing based on preference
    let lineSpacingPx = 30; // default single line
    if (lineSpacing === 'wide') {
      lineSpacingPx = 45;
    } else if (lineSpacing === 'college') {
      lineSpacingPx = 25;
    }
    
    // Draw horizontal lines
    ctx.beginPath();
    ctx.strokeStyle = "#e6e6ff"; // Light blue lines
    ctx.lineWidth = 1;
    
    for (let y = lineSpacingPx; y < height; y += lineSpacingPx) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    
    // Add a red margin line (left)
    if (mode === 'notebook') {
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = "#ffcccc"; // Light red
      ctx.lineWidth = 1;
      ctx.moveTo(40, 0);
      ctx.lineTo(40, height);
    }
    
    ctx.stroke();
    ctx.restore();
  };
  
  // Draw graph paper background
  const drawGraphPaper = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    
    const gridSize = 20;
    
    // Draw grid
    ctx.beginPath();
    ctx.strokeStyle = "#e6e6e6"; // Light gray lines
    ctx.lineWidth = 0.5;
    
    // Vertical lines
    for (let x = gridSize; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    
    // Horizontal lines
    for (let y = gridSize; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    
    ctx.stroke();
    
    // Add darker lines for main grid
    ctx.beginPath();
    ctx.strokeStyle = "#cccccc"; // Darker gray for main grid
    ctx.lineWidth = 1;
    
    // Vertical main lines
    for (let x = gridSize * 5; x < width; x += gridSize * 5) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    
    // Horizontal main lines
    for (let y = gridSize * 5; y < height; y += gridSize * 5) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    
    ctx.stroke();
    ctx.restore();
  };
  
  // Initialize canvas and set up event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    
    if (!canvas || !container) return;
    
    // Set canvas dimensions
    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      
      // If we have history, restore the last state
      if (historyIndex >= 0 && history[historyIndex]) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(history[historyIndex].imageData, 0, 0);
        }
      } else {
        drawCanvasBackground();
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // If there's initial content, load it
    if (initialContent) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          saveHistoryState();
        }
      };
      img.src = initialContent;
    } else {
      // Save initial blank state with background
      drawCanvasBackground();
      saveHistoryState();
    }
    
    // Enable pointer events for tablet support (optional, as we now have mouse support too)
    // Check for stylus capability - define this first so we can reference it in cleanup
    const detectPenTablet = (e: PointerEvent) => {
      if (e.pointerType === 'pen') {
        setIsPenTabletDetected(true);
        setCurrentTool('stylus');
        
        // Once detected, remove this listener
        window.removeEventListener('pointerdown', detectPenTablet);
      }
    };

    // Touch state tracking
    let touchDrawing = false;
    let touchLastPoint: Point | null = null;

    // Touch event handlers for better iPad support
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = e.touches[0];
      if (!touch) return;
      
      const rect = canvas.getBoundingClientRect();
      const point: Point = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        pressure: 1
      };
      
      touchDrawing = true;
      touchLastPoint = point;
      
      // Start stroke tracking
      const newStrokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentStrokeId(newStrokeId);
      setStrokeStartTime(Date.now());
      
      const strokePoint = createStrokePoint(point.x, point.y, true, point.pressure);
      setCurrentStroke([strokePoint]);
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        configureContext(ctx);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!touchDrawing || !touchLastPoint) return;
      
      const touch = e.touches[0];
      if (!touch) return;
      
      const rect = canvas.getBoundingClientRect();
      const currentPoint: Point = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        pressure: 1
      };
      
      // Add stroke point
      const strokePoint = createStrokePoint(currentPoint.x, currentPoint.y, true, currentPoint.pressure);
      setCurrentStroke(prev => [...prev, strokePoint]);
      
      const ctx = canvas.getContext('2d');
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
        
        // Add final pen_down: false point
        if (touchLastPoint) {
          const finalStrokePoint = createStrokePoint(touchLastPoint.x, touchLastPoint.y, false, 1);
          const updatedStroke = [...currentStroke, finalStrokePoint];
          const newAllStrokes = [...allStrokes, ...updatedStroke];
          
          setAllStrokes(newAllStrokes);
          
          // Notify parent of stroke data change
          if (onStrokeDataChange) {
            onStrokeDataChange(newAllStrokes);
          }
        }
        
        touchLastPoint = null;
        setCurrentStroke([]);
        saveHistoryState();
      }
    };
    
    try {
      // Add touch event listeners with highest priority for iPad support
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
      canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
      
      // Only add pointer events if touch is not supported
      if (!('ontouchstart' in window)) {
        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('pointerout', handlePointerUp);
        canvas.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener('pointerdown', detectPenTablet);
      }
      
      // Disable all default touch behaviors completely
      canvas.style.touchAction = 'none';
      canvas.style.userSelect = 'none';
      canvas.style.webkitUserSelect = 'none';
      canvas.style.webkitTouchCallout = 'none';
      canvas.style.webkitUserDrag = 'none';
      
    } catch (err) {
      console.log('Touch/Pointer events not fully supported, using mouse events as fallback');
    }
    
    // Notify parent component that canvas is ready
    if (onCanvasReady) {
      onCanvasReady(canvas);
    }
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      
      // Clean up all event listeners
      try {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointerout', handlePointerUp);
        canvas.removeEventListener('pointercancel', handlePointerUp);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchcancel', handleTouchEnd);
        window.removeEventListener('pointerdown', detectPenTablet);
      } catch (err) {
        console.log('Error cleaning up events:', err);
      }
    };
  }, []);

  // Save current canvas state to history
  const saveHistoryState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If we're not at the end of the history, truncate it
    if (historyIndex < history.length - 1) {
      setHistory(prev => prev.slice(0, historyIndex + 1));
    }
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    setHistory(prev => [...prev, { imageData }]);
    setHistoryIndex(prev => prev + 1);
    
    // Notify parent of content change
    if (onContentChange) {
      onContentChange(canvas.toDataURL());
    }
  };
  
  // Undo function
  const handleUndo = () => {
    if (historyIndex <= 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setHistoryIndex(prev => prev - 1);
    ctx.putImageData(history[historyIndex - 1].imageData, 0, 0);
    
    // Notify parent of content change
    if (onContentChange) {
      onContentChange(canvas.toDataURL());
    }
  };
  
  // Redo function
  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setHistoryIndex(prev => prev + 1);
    ctx.putImageData(history[historyIndex + 1].imageData, 0, 0);
    
    // Notify parent of content change
    if (onContentChange) {
      onContentChange(canvas.toDataURL());
    }
  };
  
  // Clear canvas
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Clear stroke data
    setAllStrokes([]);
    setCurrentStroke([]);
    if (onStrokeDataChange) {
      onStrokeDataChange([]);
    }
    
    saveHistoryState();
  };
  
  // Pointer events handlers (for pen tablet support)
  const handlePointerDown = (e: PointerEvent) => {
    // Skip all touch-based pointer events completely
    if (e.pointerType === 'touch') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Capture pointer to ensure all events are directed to this element
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    const rect = canvas.getBoundingClientRect();
    const point: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 1 // Default to 1 if pressure is not supported
    };
    
    // If it's a stylus, automatically switch to stylus tool
    if (e.pointerType === 'pen' && currentTool !== 'eraser') {
      setCurrentTool('stylus');
    }
    
    // Start stroke tracking
    const newStrokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setCurrentStrokeId(newStrokeId);
    setStrokeStartTime(Date.now());
    
    const strokePoint = createStrokePoint(point.x, point.y, true, point.pressure);
    setCurrentStroke([strokePoint]);
    
    // Store the start point for shape detection
    if (enableShapeCorrection && mode === 'free') {
      setCurrentShape({
        type: 'none',
        startPoint: point,
        points: [point]
      });
    }
    
    setLastPosition(point);
    
    // Start a new path for this stroke
    const ctx = canvas.getContext('2d');
    if (ctx) {
      configureContext(ctx);
      ctx.beginPath();
      drawPoint(ctx, point);
    }
  };
  
  const handlePointerMove = (e: PointerEvent) => {
    // Skip all touch-based pointer events completely
    if (e.pointerType === 'touch') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const point: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 1
    };
    
    // Add stroke point
    const strokePoint = createStrokePoint(point.x, point.y, true, point.pressure);
    setCurrentStroke(prev => [...prev, strokePoint]);
    
    // For shape correction, collect points during drawing
    if (enableShapeCorrection && mode === 'free') {
      setCurrentShape(prev => ({
        ...prev,
        points: [...prev.points, point]
      }));
    }
    
    // Draw a line from last position to current position
    configureContext(ctx);
    drawLine(ctx, lastPosition, point);
    
    setLastPosition(point);
  };
  
  // Function to draw the canvas background
  const drawCanvasBackground = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear the background first
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw the selected background
    switch(backgroundStyle) {
      case 'lined':
        drawLinedPaper(ctx, canvas.width, canvas.height);
        break;
      case 'graph':
        drawGraphPaper(ctx, canvas.width, canvas.height);
        break;
      case 'blank':
      default:
        // Already filled with white
        break;
    }
  };
  
  const handlePointerUp = (e: PointerEvent) => {
    // Skip all touch-based pointer events completely
    if (e.pointerType === 'touch') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    if (isDrawing) {
      // Release pointer capture
      if ((e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
      
      // Add final pen_down: false point
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const finalPoint: Point = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          pressure: e.pressure || 1
        };
        
        const finalStrokePoint = createStrokePoint(finalPoint.x, finalPoint.y, false, finalPoint.pressure);
        const updatedStroke = [...currentStroke, finalStrokePoint];
        const newAllStrokes = [...allStrokes, ...updatedStroke];
        
        setAllStrokes(newAllStrokes);
        
        // Notify parent of stroke data change
        if (onStrokeDataChange) {
          onStrokeDataChange(newAllStrokes);
        }
      }
      
      // If shape correction is enabled, try to detect and correct shapes
      if (enableShapeCorrection && mode === 'free') {
        detectAndCorrectShape();
      }
      
      setIsDrawing(false);
      setCurrentStroke([]);
      saveHistoryState();
    }
  };
  
  // Function to detect and correct drawn shapes
  const detectAndCorrectShape = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // We need at least the current history state to analyze
    if (historyIndex < 0 || !history[historyIndex]) return;
    
    // Get the current drawing's path points
    // For a simple implementation, we'll detect basic shapes
    // like lines, rectangles and circles based on start and end points
    
    // This is a simplified detection algorithm
    // A real implementation would analyze the entire path and use ML algorithms
    
    // For demonstration, we'll implement a basic straight line detector
    // If the user draws a nearly straight line, we'll correct it to a perfect line
    
    const startX = currentShape.startPoint?.x || 0;
    const startY = currentShape.startPoint?.y || 0;
    const endX = lastPosition.x;
    const endY = lastPosition.y;
    
    // Calculate distance between start and end points
    const distance = Math.sqrt(
      Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
    );
    
    // If the distance is significant (not just a dot)
    if (distance > 20) {
      // Check if it's a straight line (horizontal or vertical)
      const isHorizontal = Math.abs(endY - startY) < 15;  // Within 15px
      const isVertical = Math.abs(endX - startX) < 15;    // Within 15px
      
      if (isHorizontal) {
        // Restore canvas to before this stroke
        if (historyIndex > 0) {
          ctx.putImageData(history[historyIndex - 1].imageData, 0, 0);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawCanvasBackground();
        }
        
        // Draw a perfect horizontal line
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penSize;
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, startY);
        ctx.stroke();
        ctx.restore();
        
        return;
      }
      
      if (isVertical) {
        // Restore canvas to before this stroke
        if (historyIndex > 0) {
          ctx.putImageData(history[historyIndex - 1].imageData, 0, 0);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawCanvasBackground();
        }
        
        // Draw a perfect vertical line
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penSize;
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, endY);
        ctx.stroke();
        ctx.restore();
        
        return;
      }
      
      // Check if it's a rectangle
      // For demonstration, this is a very simplified detector
      // A real implementation would analyze the entire path
      
      // For circles, check if the path roughly forms a circle
      // This would require more sophisticated analysis
    }
  };
  
  // Mouse event handlers (fallback for non-pointer devices)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Allow both pointer events and mouse events to work
    // This ensures backward compatibility with all devices
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Start stroke tracking
    const newStrokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setCurrentStrokeId(newStrokeId);
    setStrokeStartTime(Date.now());
    
    const strokePoint = createStrokePoint(x, y, true, 1);
    setCurrentStroke([strokePoint]);
    
    setLastPosition({ x, y });
    
    // Start a new path
    const ctx = canvas.getContext('2d');
    if (ctx) {
      configureContext(ctx);
      ctx.beginPath();
      ctx.arc(x, y, penSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Add stroke point
    const strokePoint = createStrokePoint(x, y, true, 1);
    setCurrentStroke(prev => [...prev, strokePoint]);
    
    // Draw line from last position to current position
    drawLine(ctx, lastPosition, { x, y });
    
    setLastPosition({ x, y });
  };
  
  const stopDrawing = () => {
    if (isDrawing) {
      // Add final pen_down: false point
      const finalStrokePoint = createStrokePoint(lastPosition.x, lastPosition.y, false, 1);
      const updatedStroke = [...currentStroke, finalStrokePoint];
      const newAllStrokes = [...allStrokes, ...updatedStroke];
      
      setAllStrokes(newAllStrokes);
      
      // Notify parent of stroke data change
      if (onStrokeDataChange) {
        onStrokeDataChange(newAllStrokes);
      }
      
      setIsDrawing(false);
      setCurrentStroke([]);
      saveHistoryState();
    }
  };
  
  // Drawing helper functions
  const drawPoint = (ctx: CanvasRenderingContext2D, point: Point) => {
    configureContext(ctx);
    
    // Draw a single point (useful for dots and small strokes)
    ctx.beginPath();
    ctx.arc(point.x, point.y, getAdjustedPenSize(point.pressure) / 2, 0, Math.PI * 2);
    ctx.fill();
  };
  
  const drawLine = (ctx: CanvasRenderingContext2D, from: Point, to: Point) => {
    configureContext(ctx);
    
    // Draw a line from 'from' to 'to' points
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    
    // For stylus, vary line width based on pressure
    if (currentTool === 'stylus' && to.pressure !== undefined) {
      ctx.lineWidth = getAdjustedPenSize(to.pressure);
    }
    
    ctx.stroke();
  };
  
  const configureContext = (ctx: CanvasRenderingContext2D) => {
    // Set common drawing properties
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    switch(currentTool) {
      case 'pen':
        ctx.strokeStyle = penColor;
        ctx.fillStyle = penColor;
        ctx.lineWidth = penSize;
        ctx.globalCompositeOperation = 'source-over';
        break;
        
      case 'stylus':
        ctx.strokeStyle = penColor;
        ctx.fillStyle = penColor;
        ctx.lineWidth = penSize;
        ctx.globalCompositeOperation = 'source-over';
        break;
        
      case 'eraser':
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = penSize * 2; // Eraser is typically larger
        ctx.globalCompositeOperation = 'destination-out';
        break;
    }
  };
  
  // Adjust pen size based on pressure for stylus
  const getAdjustedPenSize = (pressure: number = 1): number => {
    if (currentTool === 'stylus') {
      // Scale pen size based on pressure (0.5 to 2x the base size)
      const minFactor = 0.5;
      const maxFactor = 2.0;
      const factor = minFactor + pressure * (maxFactor - minFactor);
      return penSize * factor;
    }
    return penSize;
  };

  // Create stroke point helper
  const createStrokePoint = (x: number, y: number, penDown: boolean, pressure?: number): StrokePoint => {
    const now = Date.now();
    return {
      x,
      y,
      time: strokeStartTime > 0 ? now - strokeStartTime : 0,
      pen_down: penDown,
      pressure: pressure || 1,
      stroke_id: currentStrokeId
    };
  };
  
  // Handle tool changes
  const handleToolChange = (tool: 'pen' | 'eraser' | 'stylus') => {
    setCurrentTool(tool);
  };
  
  // Handle pen color change
  const handleColorChange = (color: string) => {
    setPenColor(color);
    // Keep the current tool if it's stylus or pen
    if (currentTool === 'eraser') {
      setCurrentTool(isPenTabletDetected ? 'stylus' : 'pen');
    }
  };
  
  // Handle pen size change
  const handleSizeChange = (size: number) => {
    setPenSize(size);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-md p-3 mb-4 flex flex-wrap items-center justify-between">
        {/* Left Tools Group */}
        <div className="flex items-center space-x-2 mb-2 md:mb-0">
          {/* Pen Tools */}
          <div className="border-r pr-2 mr-2">
            <PenSizePicker onSizeChange={handleSizeChange} defaultSize={penSize} />
          </div>
          
          {/* Color Picker */}
          <ColorPicker onColorChange={handleColorChange} defaultColor={penColor} />
        </div>
        
        {/* Input Method Indicator */}
        {isPenTabletDetected && (
          <Badge variant="outline" className="bg-green-50 text-green-700 mr-2">
            Pen Tablet Detected
          </Badge>
        )}
        
        {/* Right Tools Group */}
        <div className="flex items-center space-x-3">
          {/* Pen/Stylus Button */}
          <Button
            variant={(currentTool === 'pen' || currentTool === 'stylus') ? 'secondary' : 'outline'}
            size="icon"
            onClick={() => handleToolChange(isPenTabletDetected ? 'stylus' : 'pen')}
            title={isPenTabletDetected ? "Stylus" : "Pen"}
          >
            {isPenTabletDetected ? (
              <Edit3 className="h-5 w-5" />
            ) : (
              <Pen className="h-5 w-5" />
            )}
          </Button>
          
          {/* Eraser Button */}
          <Button
            variant={currentTool === 'eraser' ? 'secondary' : 'outline'}
            size="icon"
            onClick={() => handleToolChange('eraser')}
            title="Eraser"
          >
            <Eraser className="h-5 w-5" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            title="Text Tool"
          >
            <Type className="h-5 w-5" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            title="Shapes"
          >
            <Shapes className="h-5 w-5" />
          </Button>
          
          <Separator orientation="vertical" className="h-8" />
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            title="Undo"
          >
            <Undo2 className="h-5 w-5" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            title="Redo"
          >
            <Redo2 className="h-5 w-5" />
          </Button>
          
          <Separator orientation="vertical" className="h-8" />
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleClear}
            title="Clear Canvas"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      <div 
        ref={canvasContainerRef}
        className="bg-white rounded-lg shadow-lg p-1 overflow-hidden canvas-container"
        style={{ height: '70vh' }}
      >
        <canvas
          ref={canvasRef}
          className="w-full border border-gray-200 rounded-lg bg-white"
          style={{ touchAction: 'none' }} // Disable browser handling of touch events
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
        />
      </div>
    </div>
  );
};

export default DrawingCanvas;
