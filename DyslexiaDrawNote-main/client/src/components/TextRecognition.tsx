import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { recognizeText } from '@/lib/tesseract';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, FileText, Edit } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TextRecognitionProps {
  canvasElement: HTMLCanvasElement | null;
  onTextRecognized?: (text: string) => void;
}
function getWhiteBackgroundImage(canvas: HTMLCanvasElement): string {
  const tempCanvas = document.createElement('canvas');
  const ctx = tempCanvas.getContext('2d')!;
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  ctx.drawImage(canvas, 0, 0);

  return tempCanvas.toDataURL('image/png');
}


const TextRecognition = ({ canvasElement, onTextRecognized }: TextRecognitionProps) => {
  const [recognizedText, setRecognizedText] = useState('');
  const [formattedText, setFormattedText] = useState('');
  const [suggestions, setSuggestions] = useState<{ original: string; correction: string }[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionProgress, setRecognitionProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('handwritten');

  const handleRecognizeText = async () => {
    if (!canvasElement) return;
    
    setIsRecognizing(true);
    setRecognitionProgress(0);
    
    try {
      // Pre-process indicator
      setRecognitionProgress(10);
      
      const imageData = getWhiteBackgroundImage(canvasElement);

      
      // Recognition in progress
      setRecognitionProgress(30);
      
      const result = await recognizeText(imageData);
      
      // Update state with recognition results
      setRecognizedText(result.text);
      setFormattedText(result.formattedText);
      setSuggestions(result.suggestions);
      
      // Set to computer font tab if we got good results
      if (result.formattedText && result.text.length > 5) {
        setActiveTab('computerfont');
      }
      
      if (onTextRecognized) {
        onTextRecognized(result.formattedText || result.text);
      }
      
      setRecognitionProgress(100);
    } catch (error) {
      console.error('Error recognizing text:', error);
    } finally {
      setIsRecognizing(false);
    }
  };

  const applySuggestion = (original: string, correction: string) => {
    // Apply to both text versions
    const updatedText = recognizedText.replace(new RegExp(original, 'gi'), correction);
    const updatedFormatted = formattedText.replace(new RegExp(original, 'gi'), correction);
    
    setRecognizedText(updatedText);
    setFormattedText(updatedFormatted);
    
    // Remove the applied suggestion
    setSuggestions(prevSuggestions => 
      prevSuggestions.filter(s => s.original !== original)
    );
    
    if (onTextRecognized) {
      onTextRecognized(activeTab === 'computerfont' ? updatedFormatted : updatedText);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="font-dyslexic text-lg">Text Recognition</CardTitle>
          <Button 
            onClick={handleRecognizeText} 
            disabled={!canvasElement || isRecognizing}
            size="sm"
          >
            {isRecognizing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing... {recognitionProgress > 0 ? `${recognitionProgress}%` : ''}
              </>
            ) : (
              'Recognize Text'
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {(recognizedText || formattedText) ? (
          <Tabs defaultValue={activeTab} value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="handwritten" className="flex items-center">
                <Edit className="mr-2 h-4 w-4" />
                Handwritten
              </TabsTrigger>
              <TabsTrigger value="computerfont" className="flex items-center">
                <FileText className="mr-2 h-4 w-4" />
                Computer Font
              </TabsTrigger>
            </TabsList>
            <TabsContent value="handwritten" className="mt-2">
              <div className="font-dyslexic text-gray-800 p-3 bg-gray-50 rounded-lg min-h-24 whitespace-pre-wrap">
                {recognizedText}
              </div>
            </TabsContent>
            <TabsContent value="computerfont" className="mt-2">
              <div className="font-sans text-gray-800 p-3 bg-gray-50 rounded-lg min-h-24 whitespace-pre-wrap leading-relaxed">
                {formattedText || 'No computer font text available'}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="mb-3 font-dyslexic text-gray-800 p-3 bg-gray-50 rounded-lg min-h-24">
            Draw something and click "Recognize Text" to see the result
          </div>
        )}
        
        {Array.isArray(suggestions) && suggestions.length > 0 && (
  <>
    <Separator className="my-3" />
    <h4 className="font-dyslexic font-semibold text-sm text-gray-600 mb-2">
      Suggested Corrections:
    </h4>
    <div className="flex flex-wrap gap-2">
      {suggestions.map(({ original, correction }, index) => (
        <Button
          key={index}
          variant="outline"
          className="font-dyslexic bg-accent bg-opacity-10 text-accent hover:bg-opacity-20 text-sm"
          onClick={() => applySuggestion(original, correction)}
        >
          "{original}" → "{correction}"
        </Button>
      ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TextRecognition;
