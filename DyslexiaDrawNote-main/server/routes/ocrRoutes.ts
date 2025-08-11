import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as ocrController from '../controllers/ocrController';

const router = express.Router();

// Set up multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(process.cwd(), 'ocr-training-data');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueFilename);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Initialize OCR model
router.post('/initialize', ocrController.initializeModel);

// Get model info
router.get('/model-info', ocrController.getModelInfo);

// Upload training image
router.post('/training-image', upload.single('image'), ocrController.uploadTrainingImage);

// Train model with image
router.post('/train', ocrController.trainWithImage);

// Train on batch of images
router.post('/train-batch', ocrController.trainBatch);

// Recognize text from canvas
router.post('/recognize', ocrController.recognizeFromCanvas);

// Get list of training images
router.get('/training-images', ocrController.getTrainingImages);

// Get specific training image
router.get('/training-image/:id', ocrController.getTrainingImage);

// Delete training image
router.delete('/training-image/:id', ocrController.deleteTrainingImage);

export default router;