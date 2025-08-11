import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DrawingCanvas from '@/components/DrawingCanvas';
import TextRecognition from '@/components/TextRecognition';
import CustomOcrTrainer from '@/components/CustomOcrTrainer';
import { 
  ArrowLeft, Save, Share, BrainCircuit, TextCursorInput,
  PencilLine, Edit3, LayoutTemplate, Settings
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getCanvasPreview } from '@/lib/utils';
import type { Note as NoteType } from '@shared/schema';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Note page with multiple modes
const Note = () => {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // State for note data
  const [title, setTitle] = useState('Untitled Note');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState('');
  const [recognizedText, setRecognizedText] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Canvas references and state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeMode, setActiveMode] = useState<'free' | 'notebook' | 'training'>('free');

  // Added settings for different modes
  const [autoCorrectShapes, setAutoCorrectShapes] = useState(true);
  const [instantCorrection, setInstantCorrection] = useState(true);
  const [lineSpacing, setLineSpacing] = useState<'single' | 'wide' | 'college'>('single');
  const [backgroundStyle, setBackgroundStyle] = useState<'blank' | 'lined' | 'graph'>('lined');
  const [strokeData, setStrokeData] = useState<StrokePoint[]>([]);

  // Fetch note data if editing an existing note
  const {
    data: noteData,
    isLoading,
    error
  } = useQuery<NoteType>({
    queryKey: id ? [`/api/notes/${id}`] : null,
    enabled: !!id,
  });

  // Effect to set initial data from loaded note
  useEffect(() => {
    if (noteData) {
      setTitle(noteData.title);
      setContent(noteData.content);
      setRecognizedText(noteData.recognizedText || '');
    }
  }, [noteData]);

  // Handle canvas ready event
  const handleCanvasReady = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  };

  // Handle canvas content change
  const handleContentChange = (newContent: string) => {
    setContent(newContent);

    // Generate preview when content changes
    if (canvasRef.current) {
      setPreview(getCanvasPreview(canvasRef.current));
    }
  };
    const handleStrokeDataChange = (strokes: StrokePoint[]) => {
        setStrokeData(strokes);
    };

  // Handle recognized text from TextRecognition component
  const handleTextRecognized = (text: string) => {
    setRecognizedText(text);
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const noteData = {
        title,
        content,
        preview,
        recognizedText,
        isFavorite: noteData?.isFavorite || false
      };

      if (id) {
        // Update existing note
        await apiRequest('PUT', `/api/notes/${id}`, noteData);
      } else {
        // Create new note
        await apiRequest('POST', '/api/notes', noteData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notes'] });
      if (id) {
        queryClient.invalidateQueries({ queryKey: [`/api/notes/${id}`] });
      }

      setLastSavedAt(new Date());

      toast({
        title: id ? 'Note updated' : 'Note created',
        description: `"${title}" has been ${id ? 'updated' : 'saved'} successfully.`,
      });

      // If this is a new note, navigate to home after saving
      if (!id) {
        navigate('/');
      }
    },
    onError: () => {
      toast({
        title: 'Error saving note',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    }
  });

  // Function to handle save button click
  const handleSave = () => {
    saveMutation.mutate();
  };

  // Function to render mode-specific settings
  const renderModeSettings = () => {
    switch(activeMode) {
      case 'free':
        return (
          <div className="flex flex-col space-y-4 md:space-y-0 md:flex-row md:items-center md:justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-correct-shapes"
                checked={autoCorrectShapes}
                onCheckedChange={setAutoCorrectShapes}
              />
              <Label htmlFor="auto-correct-shapes">Auto-correct shapes</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Label htmlFor="background-style">Background:</Label>
              <Select
                value={backgroundStyle}
                onValueChange={(value: 'blank' | 'lined' | 'graph') => setBackgroundStyle(value)}
              >
                <SelectTrigger id="background-style" className="w-[140px]">
                  <SelectValue placeholder="Background style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank</SelectItem>
                  <SelectItem value="lined">Lined</SelectItem>
                  <SelectItem value="graph">Graph</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'notebook':
        return (
          <div className="flex flex-col space-y-4 md:space-y-0 md:flex-row md:items-center md:justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Switch
                id="instant-correction"
                checked={instantCorrection}
                onCheckedChange={setInstantCorrection}
              />
              <Label htmlFor="instant-correction">Instant text correction</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Label htmlFor="line-spacing">Line spacing:</Label>
              <Select
                value={lineSpacing}
                onValueChange={(value: 'single' | 'wide' | 'college') => setLineSpacing(value)}
              >
                <SelectTrigger id="line-spacing" className="w-[140px]">
                  <SelectValue placeholder="Line spacing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single line</SelectItem>
                  <SelectItem value="wide">Wide ruled</SelectItem>
                  <SelectItem value="college">College ruled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'training':
        return (
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Train the OCR model to better recognize your handwriting. Add samples to improve accuracy.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div>
      {/* Note Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div className="flex items-center mb-4 md:mb-0">
          <Button 
            variant="ghost"
            className="mr-4 text-gray-600 hover:text-primary"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>

          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-2xl font-bold font-dyslexic bg-transparent border-b border-transparent focus:border-primary focus:ring-0 py-1 px-2 w-auto"
            placeholder="Untitled Note"
          />
        </div>

        <div className="flex space-x-3">
          <Button
            onClick={handleSave}
            className="bg-secondary text-white font-dyslexic flex items-center"
            disabled={saveMutation.isPending}
          >
            <Save className="mr-2 h-5 w-5" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>

          <Button
            variant="outline"
            className="text-gray-700 font-dyslexic flex items-center"
          >
            <Share className="mr-2 h-5 w-5" />
            Share
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && id && (
        <div className="flex justify-center items-center min-h-[70vh]">
          <p className="font-dyslexic text-lg">Loading note...</p>
        </div>
      )}

      {/* Error state */}
      {error && id && (
        <div className="flex justify-center items-center min-h-[70vh]">
          <p className="font-dyslexic text-lg text-red-500">
            Error loading note. Please try again later.
          </p>
        </div>
      )}

      {/* Note content */}
      {(!isLoading || !id) && (
        <div className="relative">
          {/* Mode Selector Tabs */}
          <Tabs 
            defaultValue={activeMode} 
            className="w-full mb-6"
            onValueChange={(value) => setActiveMode(value as 'free' | 'notebook' | 'training')}
          >
            <div className="flex justify-between items-center">
              <TabsList>
                <TabsTrigger value="free" className="flex items-center">
                  <PencilLine className="mr-2 h-4 w-4" />
                  Free Drawing
                </TabsTrigger>
                <TabsTrigger value="notebook" className="flex items-center">
                  <LayoutTemplate className="mr-2 h-4 w-4" />
                  Notebook Mode
                </TabsTrigger>
                <TabsTrigger value="training" className="flex items-center">
                  <BrainCircuit className="mr-2 h-4 w-4" />
                  Training Mode
                </TabsTrigger>
              </TabsList>

              <Button variant="ghost" size="sm" className="ml-auto">
                <Settings className="h-4 w-4 mr-1" />
                Settings
              </Button>
            </div>

            {/* Mode-specific settings */}
            <div className="mt-2">
              {renderModeSettings()}
            </div>

            {/* Free Drawing Mode */}
            <TabsContent value="free">
              <DrawingCanvas
                initialContent={content}
                onContentChange={handleContentChange}
                 onStrokeDataChange={handleStrokeDataChange}
                onCanvasReady={handleCanvasReady}
                backgroundStyle={backgroundStyle}
                enableShapeCorrection={autoCorrectShapes}
                mode="free"
              />

              {/* Recognition panel for free mode */}
              <div className="mt-4">
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="font-medium mb-2 font-dyslexic">Recognized Text:</h3>
                  <TextRecognition
                    canvasElement={canvasRef.current}
                    onTextRecognized={handleTextRecognized}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Notebook Mode */}
            <TabsContent value="notebook">
              <DrawingCanvas
                initialContent={content}
                onContentChange={handleContentChange}
                 onStrokeDataChange={handleStrokeDataChange}
                onCanvasReady={handleCanvasReady}
                backgroundStyle="lined"
                lineSpacing={lineSpacing}
                enableInstantCorrection={instantCorrection}
                mode="notebook"
              />

              {/* Real-time recognized text display for notebook mode */}
              <div className="mt-4 bg-white rounded-lg shadow p-4">
                <h3 className="font-medium mb-2 font-dyslexic">Corrected Text:</h3>
                <div className="min-h-[100px] p-3 bg-slate-50 rounded border font-dyslexic text-lg leading-relaxed">
                  {recognizedText || 'Write on the lines above to see instant text correction'}
                </div>
              </div>
            </TabsContent>

            {/* Training Mode */}
            <TabsContent value="training">
              <div className="bg-white rounded-lg shadow p-4">
                <CustomOcrTrainer canvasElement={canvasRef.current} />
              </div>
            </TabsContent>
          </Tabs>
           <Tabs className="w-full">
             <TabsList className="grid w-full grid-cols-2">
                  
                </TabsList>

                

                
              </Tabs>
        </div>
      )}

      {/* Last saved information */}
      {lastSavedAt && (
        <div className="mt-4 text-right text-sm text-gray-500 font-dyslexic">
          Last saved: {lastSavedAt.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default Note;

interface StrokePoint {
  x: number;
  y: number;
  time: number;
  pen_down: boolean;
  pressure?: number;
  stroke_id?: string;
}