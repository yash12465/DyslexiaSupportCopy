import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, RefreshCw, Save, Brain, FileImage } from 'lucide-react';
import DrawingCanvas from '@/components/DrawingCanvas';
import { apiRequest } from '@/lib/queryClient';
import { getCanvasPreview } from '@/lib/utils';

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

const Training = () => {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [trainingImages, setTrainingImages] = useState<TrainingImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [currentLabel, setCurrentLabel] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [activeTab, setActiveTab] = useState('draw');
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  
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
  
  // Handle canvas ready
  const handleCanvasReady = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  };
  
  // Handle canvas capture for training
  const handleCaptureCanvas = async () => {
    if (!canvasRef.current || !currentLabel.trim()) {
      toast({
        title: 'Invalid input',
        description: 'Please draw something and provide a label',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    try {
      // Convert canvas to data URL
      const canvasData = canvasRef.current.toDataURL('image/png');
      
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
      
      toast({
        title: 'Success',
        description: 'Drawing captured for training',
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
      setIsUploading(false);
    }
  };
  
  // Handle single file upload for training
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

    setIsUploading(true);
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
      setIsUploading(false);
    }
  };
  
  // Handle batch file upload for training
  const handleBatchUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      toast({
        title: 'Invalid input',
        description: 'Please select files for batch upload',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    try {
      // For each file in the selection, try to extract a label from the filename
      // and upload it as a training image
      let uploadCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Try to extract label from filename (e.g. "letter_A.png" -> "A")
        let fileLabel = '';
        
        // Extract last part before extension and use as label
        const match = file.name.match(/([^\/\\]+)\.([^\.]+)$/);
        if (match) {
          fileLabel = match[1];
          // If it contains underscore, take the part after it
          if (fileLabel.includes('_')) {
            fileLabel = fileLabel.split('_').pop() || '';
          }
        }
        
        // If no label could be extracted, skip this file
        if (!fileLabel) {
          errorCount++;
          continue;
        }
        
        // Create form data for this file
        const formData = new FormData();
        formData.append('image', file);
        formData.append('label', fileLabel);
        
        try {
          const response = await fetch('/api/ocr/upload-training', {
            method: 'POST',
            body: formData
          });
          
          if (response.ok) {
            uploadCount++;
          } else {
            errorCount++;
          }
        } catch (e) {
          errorCount++;
        }
      }
      
      // Refresh training images
      fetchTrainingData();
      
      // Clear file input
      if (batchFileInputRef.current) {
        batchFileInputRef.current.value = '';
      }
      
      // Show appropriate toast message
      if (uploadCount > 0) {
        toast({
          title: 'Batch Upload Complete',
          description: `Successfully uploaded ${uploadCount} images${errorCount > 0 ? `, failed to upload ${errorCount} images` : ''}`,
        });
      } else {
        toast({
          title: 'Batch Upload Failed',
          description: 'Could not upload any images. Make sure filenames contain labels.',
          variant: 'destructive'
        });
      }
      
    } catch (error) {
      console.error('Error with batch upload:', error);
      toast({
        title: 'Error',
        description: 'Failed to process batch upload',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
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
  
  // Handle training on all images
  const handleTrainAll = async () => {
    if (trainingImages.length === 0) {
      toast({
        title: 'No training data',
        description: 'Please upload images first',
        variant: 'destructive'
      });
      return;
    }

    setIsTraining(true);
    try {
      const response = await apiRequest('POST', '/api/ocr/train-batch', {});
      
      toast({
        title: 'Success',
        description: 'Model trained on all images',
      });
      
      // Refresh model info
      const modelInfoResponse = await apiRequest('GET', '/api/ocr/status');
      setModelInfo(modelInfoResponse.modelInfo);
      
    } catch (error) {
      console.error('Error training model on all images:', error);
      toast({
        title: 'Error',
        description: 'Failed to train model on all images',
        variant: 'destructive'
      });
    } finally {
      setIsTraining(false);
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
      
      // If this was the selected image, clear selection
      if (selectedImageId === imageId) {
        setSelectedImageId(null);
        setCurrentLabel('');
      }
      
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
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-8">
        <Button 
          variant="ghost"
          className="mr-4"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Notes
        </Button>
        <h1 className="text-3xl font-bold font-dyslexic">OCR Model Training</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Left column - Training Controls */}
        <div className="md:col-span-2">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Add Training Data</CardTitle>
              <CardDescription>
                Add samples to teach the OCR model to recognize dyslexic handwriting
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="draw">Draw</TabsTrigger>
                  <TabsTrigger value="upload">Upload</TabsTrigger>
                  <TabsTrigger value="batch">Batch</TabsTrigger>
                </TabsList>
                
                {/* Draw Tab */}
                <TabsContent value="draw">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="draw-label">Character or Word Label</Label>
                      <Input
                        id="draw-label"
                        placeholder="What does this represent? (e.g. 'A', 'cat')"
                        value={currentLabel}
                        onChange={(e) => setCurrentLabel(e.target.value)}
                      />
                    </div>
                    
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <DrawingCanvas
                        onCanvasReady={handleCanvasReady}
                        mode="training"
                      />
                    </div>
                    
                    <Button 
                      className="w-full" 
                      onClick={handleCaptureCanvas}
                      disabled={isUploading || !currentLabel.trim()}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isUploading ? 'Saving...' : 'Save Drawing as Training Data'}
                    </Button>
                  </div>
                </TabsContent>
                
                {/* Upload Tab */}
                <TabsContent value="upload">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="upload-label">Character or Word Label</Label>
                      <Input
                        id="upload-label"
                        placeholder="What does this represent? (e.g. 'A', 'cat')"
                        value={currentLabel}
                        onChange={(e) => setCurrentLabel(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="upload-image">Upload Image</Label>
                      <Input
                        ref={fileInputRef}
                        id="upload-image"
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      Upload an image of handwriting. The clearer the better!
                    </p>
                  </div>
                </TabsContent>
                
                {/* Batch Tab */}
                <TabsContent value="batch">
                  <div className="space-y-4">
                    <p className="text-sm">
                      Upload multiple images at once. The filename will be used as the label.
                      For example, "A.png" will be labeled as "A".
                    </p>
                    
                    <div className="space-y-2">
                      <Label htmlFor="batch-upload">Upload Multiple Images</Label>
                      <Input
                        ref={batchFileInputRef}
                        id="batch-upload"
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleBatchUpload}
                        disabled={isUploading}
                      />
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      Tip: Name your files with the character they represent, like "letter_A.png" or "digit_5.jpg"
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Model Information</CardTitle>
              <CardDescription>
                Current status of your custom OCR model
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              {modelInfo ? (
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="font-medium">Status:</div>
                    <div>{modelInfo.exists ? 'Trained' : 'Not trained'}</div>
                    
                    <div className="font-medium">Model Type:</div>
                    <div>{modelInfo.modelType}</div>
                    
                    <div className="font-medium">Character Set Size:</div>
                    <div>{modelInfo.numClasses || 'N/A'}</div>
                    
                    <div className="font-medium">Characters:</div>
                    <div className="overflow-x-auto">{modelInfo.charSet || 'No characters trained yet'}</div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-muted-foreground">
                  {isLoading ? 'Loading model information...' : 'No model information available'}
                </div>
              )}
            </CardContent>
            
            <CardFooter className="flex justify-between">
              <Button
                variant="outline"
                onClick={fetchTrainingData}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              
              <Button
                variant="secondary"
                onClick={handleInitializeModel}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Initialize/Reset Model'}
              </Button>
            </CardFooter>
          </Card>
        </div>
        
        {/* Right column - Image Gallery & Training */}
        <div className="md:col-span-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Training Image Gallery</CardTitle>
                <CardDescription>
                  {trainingImages.length} images available for training
                </CardDescription>
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
            </CardHeader>
            
            <CardContent>
              {trainingImages.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto p-1">
                  {trainingImages.map((image) => (
                    <Card 
                      key={image.id} 
                      className={`cursor-pointer border-2 ${selectedImageId === image.id ? 'border-primary' : 'border-transparent'}`}
                      onClick={() => {
                        setSelectedImageId(image.id);
                        setCurrentLabel(image.label);
                      }}
                    >
                      <CardContent className="p-2 relative">
                        <div className="relative h-24 w-full bg-slate-100">
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
                            ✕
                          </Button>
                        </div>
                        <p className="mt-2 text-center text-sm font-medium truncate">{image.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground flex flex-col items-center">
                  <FileImage className="h-12 w-12 mb-4 text-muted-foreground/50" />
                  <p>No training images available</p>
                  <p className="text-sm">Upload or draw some to get started</p>
                </div>
              )}
            </CardContent>
            
            <CardFooter className="flex-col space-y-4">
              {selectedImageId && (
                <div className="w-full space-y-2">
                  <Label htmlFor="train-label">Training Label</Label>
                  <div className="flex gap-2">
                    <Input
                      id="train-label"
                      placeholder="Correct label for this image"
                      value={currentLabel}
                      onChange={(e) => setCurrentLabel(e.target.value)}
                    />
                    <Button 
                      disabled={isTraining || !currentLabel.trim()} 
                      onClick={handleTrainModel}
                    >
                      Train
                    </Button>
                  </div>
                </div>
              )}
              
              <Button 
                className="w-full" 
                onClick={handleTrainAll}
                disabled={isTraining || trainingImages.length === 0}
              >
                <Brain className="mr-2 h-4 w-4" />
                {isTraining ? 'Training...' : 'Train Model on All Images'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Training;