import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as ocrModel from '../services/ocrModel';

// In-memory storage for training images metadata
interface TrainingImage {
  id: string;
  label: string;
  filename: string;
  path: string;
}

let trainingImages: TrainingImage[] = [];

// Ensure the uploads and training directories exist
const initializeDirectories = () => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const trainingDir = path.join(uploadsDir, 'training');
  
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  if (!fs.existsSync(trainingDir)) {
    fs.mkdirSync(trainingDir, { recursive: true });
  }
};

// Load existing training images at startup
const loadTrainingImages = () => {
  const trainingDir = path.join(process.cwd(), 'uploads/training');
  
  // Ensure directories exist
  initializeDirectories();
  
  try {
    // Try to load metadata file if it exists
    const metadataPath = path.join(trainingDir, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      trainingImages = metadata.images || [];
      
      // Filter out images that no longer exist
      trainingImages = trainingImages.filter(img => {
        const imgPath = path.join(trainingDir, img.filename);
        return fs.existsSync(imgPath);
      });
    }
  } catch (error) {
    console.error('Error loading training image metadata:', error);
    trainingImages = [];
  }
};

// Save training images metadata
const saveTrainingImagesMetadata = () => {
  const metadataPath = path.join(process.cwd(), 'uploads/training/metadata.json');
  
  try {
    fs.writeFileSync(metadataPath, JSON.stringify({ images: trainingImages }, null, 2));
  } catch (error) {
    console.error('Error saving training image metadata:', error);
  }
};

// Initialize at startup
loadTrainingImages();

/**
 * Initialize the OCR model
 */
export async function initializeModel(req: Request, res: Response) {
  try {
    const model = await ocrModel.initializeModel();
    
    const modelInfo = await ocrModel.getModelInfo();
    
    res.json({
      success: true,
      message: 'OCR model initialized successfully',
      modelInfo
    });
  } catch (error) {
    console.error('Error initializing OCR model:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize OCR model',
      error: error.message
    });
  }
}

/**
 * Get model info
 */
export async function getModelInfo(req: Request, res: Response) {
  try {
    const modelInfo = await ocrModel.getModelInfo();
    
    res.json({
      success: true,
      modelInfo
    });
  } catch (error) {
    console.error('Error getting model info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get model info',
      error: error.message
    });
  }
}

/**
 * Upload and store training image
 */
export async function uploadTrainingImage(req: Request, res: Response) {
  if (!req.file || !req.body.label) {
    return res.status(400).json({
      success: false,
      message: 'Image file and label are required'
    });
  }
  
  try {
    const label = req.body.label;
    const filename = req.file.filename;
    const id = uuidv4();
    
    // Add to training images array
    const imageRecord: TrainingImage = {
      id,
      label,
      filename,
      path: `/api/ocr/training-image/${id}`
    };
    
    trainingImages.push(imageRecord);
    
    // Save metadata
    saveTrainingImagesMetadata();
    
    res.json({
      success: true,
      message: 'Training image uploaded successfully',
      image: imageRecord
    });
  } catch (error) {
    console.error('Error uploading training image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload training image',
      error: error.message
    });
  }
}

/**
 * Train model with uploaded image 
 */
export async function trainWithImage(req: Request, res: Response) {
  const { imageId, label } = req.body;
  
  if (!imageId || !label) {
    return res.status(400).json({
      success: false,
      message: 'Image ID and label are required'
    });
  }
  
  try {
    // Find image record
    const imageRecord = trainingImages.find(img => img.id === imageId);
    if (!imageRecord) {
      return res.status(404).json({
        success: false,
        message: 'Training image not found'
      });
    }
    
    // Update label if it changed
    if (imageRecord.label !== label) {
      imageRecord.label = label;
      saveTrainingImagesMetadata();
    }
    
    // Get image path
    const imagePath = path.join(process.cwd(), 'uploads/training', imageRecord.filename);
    
    // Train model with image
    await ocrModel.updateModelWithExample(imagePath, label);
    
    res.json({
      success: true,
      message: 'Model trained successfully with image'
    });
  } catch (error) {
    console.error('Error training model with image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to train model with image',
      error: error.message
    });
  }
}

/**
 * Upload canvas and recognize text 
 */
export async function recognizeFromCanvas(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Image data is required'
    });
  }
  
  try {
    // Get file path and recognize text
    const imagePath = req.file.path;
    const recognizedText = await ocrModel.recognizeText(await ocrModel.preprocessImage(imagePath));
    
    // Clean up the temp file
    try {
      fs.unlinkSync(imagePath);
    } catch (e) {
      console.error('Error deleting temporary file:', e);
    }
    
    res.json({
      success: true,
      text: recognizedText
    });
  } catch (error) {
    console.error('Error recognizing text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recognize text',
      error: error.message
    });
  }
}

/**
 * Train on a batch of training images
 */
export async function trainBatch(req: Request, res: Response) {
  if (trainingImages.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No training images available'
    });
  }
  
  try {
    // Prepare batch data
    const batchData = await Promise.all(
      trainingImages.map(async (img) => {
        const imagePath = path.join(process.cwd(), 'uploads/training', img.filename);
        const tensor = await ocrModel.preprocessImage(imagePath);
        return {
          tensor,
          label: img.label
        };
      })
    );
    
    // Train on batch
    await ocrModel.trainOnBatch(batchData);
    
    res.json({
      success: true,
      message: `Model trained on batch of ${trainingImages.length} images`
    });
  } catch (error) {
    console.error('Error training on batch:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to train on batch',
      error: error.message
    });
  }
}

/**
 * Get list of all training images
 */
export async function getTrainingImages(req: Request, res: Response) {
  res.json({
    success: true,
    trainingImages
  });
}

/**
 * Serve a training image
 */
export async function getTrainingImage(req: Request, res: Response) {
  const { id } = req.params;
  
  // Find image record
  const imageRecord = trainingImages.find(img => img.id === id);
  if (!imageRecord) {
    return res.status(404).json({
      success: false,
      message: 'Training image not found'
    });
  }
  
  // Get image path
  const imagePath = path.join(process.cwd(), 'uploads/training', imageRecord.filename);
  
  // Check if file exists
  if (!fs.existsSync(imagePath)) {
    // Remove from metadata and save
    trainingImages = trainingImages.filter(img => img.id !== id);
    saveTrainingImagesMetadata();
    
    return res.status(404).json({
      success: false,
      message: 'Training image file not found'
    });
  }
  
  // Serve the file
  res.sendFile(imagePath);
}

/**
 * Delete a training image
 */
export async function deleteTrainingImage(req: Request, res: Response) {
  const { id } = req.params;
  
  // Find image record
  const imageRecord = trainingImages.find(img => img.id === id);
  if (!imageRecord) {
    return res.status(404).json({
      success: false,
      message: 'Training image not found'
    });
  }
  
  try {
    // Get image path
    const imagePath = path.join(process.cwd(), 'uploads/training', imageRecord.filename);
    
    // Delete file if it exists
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    // Remove from metadata and save
    trainingImages = trainingImages.filter(img => img.id !== id);
    saveTrainingImagesMetadata();
    
    res.json({
      success: true,
      message: 'Training image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting training image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete training image',
      error: error.message
    });
  }
}