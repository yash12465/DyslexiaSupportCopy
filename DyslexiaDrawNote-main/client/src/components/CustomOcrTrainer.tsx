import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Upload, Database, Brain, Trash2, RefreshCw } from 'lucide-react';

interface CustomOcrTrainerProps {
  canvasElement: HTMLCanvasElement | null;
}

interface TrainingImage {
  id: string;
  label: string;
  filename: string;
  path: string;
}

interface ModelInfo {
  exists: boolean;
  modelType: string;
  inputShape: number[];
  outputShape: number[];
  numClasses: number;
  charSet: string;
}

const CustomOcrTrainer: React.FC<CustomOcrTrainerProps> = ({ canvasElement }) => {
  const [trainingImages, setTrainingImages] = useState<TrainingImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [currentLabel, setCurrentLabel] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [activeTab, setActiveTab] = useState('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch existing training images and model info
  const fetchTrainingData = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('GET', '/api/ocr/training-images');
      setTrainingImages(response.trainingImages || []);
      
      const modelInfoResponse = await apiRequest('GET', '/api/ocr/status');
      setModelInfo(modelInfoResponse.modelInfo);
    } catch (error) {
      console.error('Error fetching training data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load training data',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrainingData();
  }, []);

  // Handle canvas capture for training
  const handleCaptureCanvas = async () => {
    if (!canvasElement || !currentLabel.trim()) {
      toast({
        title: 'Invalid input',
        description: 'Please draw something and provide a label',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      // Convert canvas to data URL
      const canvasData = canvasElement.toDataURL('image/png');
      
      // Create form data
      const formData = new FormData();
      
      // Convert data URL to blob
      const response = await fetch(canvasData);
      const blob = await response.blob();
      
      // Append to form data
      formData.append('image', blob, 'canvas_drawing.png');
      formData.append('label', currentLabel);
      
      // Send to server
      const uploadResponse = await fetch('/api/ocr/upload-training', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload canvas data');
      }
      
      const result = await uploadResponse.json();
      
      toast({
        title: 'Success',
        description: 'Canvas captured for training',
      });
      
      // Refresh training images
      fetchTrainingData();
      
      // Clear label input
      setCurrentLabel('');
      
    } catch (error) {
      console.error('Error capturing canvas:', error);
      toast({
        title: 'Error',
        description: 'Failed to capture canvas for training',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file upload for training
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentLabel.trim()) {
      toast({
        title: 'Invalid input',
        description: 'Please select a file and provide a label',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', files[0]);
      formData.append('label', currentLabel);
      
      const uploadResponse = await fetch('/api/ocr/upload-training', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }
      
      const result = await uploadResponse.json();
      
      toast({
        title: 'Success',
        description: 'Image uploaded for training',
      });
      
      // Refresh training images
      fetchTrainingData();
      
      // Clear file input and label
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setCurrentLabel('');
      
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload image for training',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle training the model with a selected image
  const handleTrainModel = async () => {
    if (!selectedImageId || !currentLabel.trim()) {
      toast({
        title: 'Invalid input',
        description: 'Please select an image and provide a label',
        variant: 'destructive'
      });
      return;
    }

    setIsTraining(true);
    try {
      const response = await apiRequest('POST', '/api/ocr/train', {
        imageId: selectedImageId,
        label: currentLabel
      });
      
      toast({
        title: 'Success',
        description: 'Model trained successfully',
      });
      
      // Refresh model info
      const modelInfoResponse = await apiRequest('GET', '/api/ocr/status');
      setModelInfo(modelInfoResponse.modelInfo);
      
      // Clear selection and label
      setSelectedImageId(null);
      setCurrentLabel('');
      
    } catch (error) {
      console.error('Error training model:', error);
      toast({
        title: 'Error',
        description: 'Failed to train model',
        variant: 'destructive'
      });
    } finally {
      setIsTraining(false);
    }
  };

  // Handle recognizing text from canvas
  const handleRecognizeText = async () => {
    if (!canvasElement) {
      toast({
        title: 'Invalid input',
        description: 'Please draw something first',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const canvasData = canvasElement.toDataURL('image/png');
      
      const response = await apiRequest('POST', '/api/ocr/recognize', {
        canvasData
      });
      
      setRecognizedText(response.text || 'No text recognized');
      
    } catch (error) {
      console.error('Error recognizing text:', error);
      toast({
        title: 'Error',
        description: 'Failed to recognize text',
        variant: 'destructive'
      });
      setRecognizedText('Error recognizing text');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle deleting a training image
  const handleDeleteImage = async (imageId: string) => {
    try {
      await apiRequest('DELETE', `/api/ocr/training-image/${imageId}`);
      
      toast({
        title: 'Success',
        description: 'Training image deleted',
      });
      
      // Refresh training images
      fetchTrainingData();
      
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete training image',
        variant: 'destructive'
      });
    }
  };

  // Handle initializing or resetting the model
  const handleInitializeModel = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/ocr/initialize');
      
      setModelInfo(response.modelInfo);
      
      toast({
        title: 'Success',
        description: 'OCR model initialized successfully',
      });
      
    } catch (error) {
      console.error('Error initializing model:', error);
      toast({
        title: 'Error',
        description: 'Failed to initialize model',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Custom OCR Model Trainer</CardTitle>
        <CardDescription>
          Train a custom model to recognize dyslexic handwriting
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload Training Data</TabsTrigger>
            <TabsTrigger value="train">Train Model</TabsTrigger>
            <TabsTrigger value="test">Test Recognition</TabsTrigger>
          </TabsList>
          
          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Character/Word Label</Label>
              <Input
                id="label"
                placeholder="Enter the text this represents..."
                value={currentLabel}
                onChange={(e) => setCurrentLabel(e.target.value)}
              />
            </div>
            
            <div className="flex flex-col gap-4">
              <Button 
                disabled={isLoading || !canvasElement} 
                onClick={handleCaptureCanvas}
              >
                <Upload className="mr-2 h-4 w-4" />
                Capture Current Canvas
              </Button>
              
              <div className="flex items-center">
                <Separator className="flex-grow" />
                <span className="mx-2 text-sm text-muted-foreground">Or</span>
                <Separator className="flex-grow" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="training-image">Upload Image File</Label>
                <Input
                  ref={fileInputRef}
                  id="training-image"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={isLoading}
                />
              </div>
            </div>
          </TabsContent>
          
          {/* Train Tab */}
          <TabsContent value="train" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-medium">Training Images</h3>
                <p className="text-sm text-muted-foreground">
                  {trainingImages.length} images available for training
                </p>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={fetchTrainingData}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto p-2">
              {trainingImages.map((image) => (
                <Card 
                  key={image.id} 
                  className={`cursor-pointer ${selectedImageId === image.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => {
                    setSelectedImageId(image.id);
                    setCurrentLabel(image.label);
                  }}
                >
                  <CardContent className="p-2">
                    <div className="relative h-32 w-full">
                      <img 
                        src={image.path} 
                        alt={image.label} 
                        className="h-full w-full object-contain"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-0 right-0 h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteImage(image.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="mt-2 text-center font-medium">{image.label}</p>
                  </CardContent>
                </Card>
              ))}
              
              {trainingImages.length === 0 && (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  No training images available. Upload some in the "Upload" tab.
                </div>
              )}
            </div>
            
            <div className="space-y-2 mt-4">
              <Label htmlFor="train-label">Training Label</Label>
              <Input
                id="train-label"
                placeholder="Enter the correct text..."
                value={currentLabel}
                onChange={(e) => setCurrentLabel(e.target.value)}
              />
            </div>
            
            <Button 
              className="w-full" 
              disabled={isTraining || !selectedImageId || !currentLabel.trim()} 
              onClick={handleTrainModel}
            >
              <Brain className="mr-2 h-4 w-4" />
              {isTraining ? 'Training...' : 'Train Model with Selected Image'}
            </Button>
          </TabsContent>
          
          {/* Test Tab */}
          <TabsContent value="test" className="space-y-4">
            <Button 
              className="w-full" 
              disabled={isLoading || !canvasElement} 
              onClick={handleRecognizeText}
            >
              Recognize Text from Current Canvas
            </Button>
            
            <div className="border rounded-md p-4 min-h-[100px] bg-muted/30">
              <h3 className="text-sm font-medium mb-2">Recognized Text:</h3>
              <p className="text-lg">{recognizedText || 'Draw something and click recognize'}</p>
            </div>
            
            {modelInfo && (
              <div className="border rounded-md p-4 bg-muted/30 space-y-2">
                <h3 className="text-sm font-medium">Model Information:</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p>Status:</p>
                  <p>{modelInfo.exists ? 'Trained' : 'Not trained'}</p>
                  
                  <p>Type:</p>
                  <p>{modelInfo.modelType}</p>
                  
                  <p>Character Set Size:</p>
                  <p>{modelInfo.numClasses}</p>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleInitializeModel}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Initialize/Reset Model
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      
      <CardFooter className="flex flex-col space-y-2">
        <p className="text-sm text-muted-foreground">
          This model will improve over time as you add more training data.
        </p>
      </CardFooter>
    </Card>
  );
};

export default CustomOcrTrainer;