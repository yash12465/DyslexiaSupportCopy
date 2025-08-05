import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import * as path from 'path';
// We'll handle image processing directly without Jimp for simplicity

// Model paths
const MODEL_PATH = path.join(process.cwd(), 'ocr-model');
const MODEL_JSON_PATH = path.join(MODEL_PATH, 'model.json');

// Constants for OCR
const IMAGE_SIZE = 28; // Standard size for OCR input (28x28)
const CHAR_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,?!-_\'";:()[]{}<>';

// Global model instance
let model: tf.LayersModel | null = null;

// Make sure the model directory exists
const ensureModelDir = () => {
  if (!fs.existsSync(MODEL_PATH)) {
    fs.mkdirSync(MODEL_PATH, { recursive: true });
  }
};

/**
 * Create a new model for dyslexic handwriting recognition
 */
export async function createModel(): Promise<tf.LayersModel> {
  // Simple convolutional model for character recognition
  const m = tf.sequential();
  
  // Input shape: 28x28 grayscale images (1 channel)
  m.add(tf.layers.conv2d({
    inputShape: [IMAGE_SIZE, IMAGE_SIZE, 1],
    filters: 32,
    kernelSize: 3,
    activation: 'relu',
    padding: 'same'
  }));
  
  m.add(tf.layers.maxPooling2d({
    poolSize: 2,
    strides: 2
  }));
  
  m.add(tf.layers.conv2d({
    filters: 64,
    kernelSize: 3,
    activation: 'relu',
    padding: 'same'
  }));
  
  m.add(tf.layers.maxPooling2d({
    poolSize: 2,
    strides: 2
  }));
  
  m.add(tf.layers.conv2d({
    filters: 128,
    kernelSize: 3,
    activation: 'relu',
    padding: 'same'
  }));
  
  m.add(tf.layers.maxPooling2d({
    poolSize: 2,
    strides: 2
  }));
  
  m.add(tf.layers.flatten());
  
  m.add(tf.layers.dense({
    units: 256,
    activation: 'relu'
  }));
  
  m.add(tf.layers.dropout({ rate: 0.5 }));
  
  // Output layer: one node per character in the charset
  m.add(tf.layers.dense({
    units: CHAR_SET.length,
    activation: 'softmax'
  }));
  
  // Compile the model
  m.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });
  
  return m;
}

/**
 * Initialize the OCR model - create new or load existing
 */
export async function initializeModel(): Promise<tf.LayersModel> {
  ensureModelDir();
  
  try {
    // Check if model exists
    if (fs.existsSync(MODEL_JSON_PATH)) {
      console.log('Loading existing OCR model...');
      model = await tf.loadLayersModel(`file://${MODEL_JSON_PATH}`);
    } else {
      console.log('Creating new OCR model...');
      model = await createModel();
      
      // Save the new model
      await model.save(`file://${MODEL_PATH}`);
    }
    
    model.summary();
    return model;
  } catch (error) {
    console.error('Error initializing OCR model:', error);
    
    // If loading fails, create a new model
    console.log('Creating new OCR model after failed load...');
    model = await createModel();
    
    // Save the new model
    await model.save(`file://${MODEL_PATH}`);
    return model;
  }
}

/**
 * Preprocess image for training or prediction - simplified version
 */
export async function preprocessImage(imagePath: string): Promise<tf.Tensor4D> {
  try {
    // Read the image file using TensorFlow
    const imageBuffer = fs.readFileSync(imagePath);
    const tfImage = tf.node.decodeImage(imageBuffer, 1); // 1 channel (grayscale)
    
    // Resize and normalize
    const resized = tf.image.resizeBilinear(tfImage, [IMAGE_SIZE, IMAGE_SIZE]);
    const normalized = tf.div(resized, 255.0);
    
    // Reshape to [1, IMAGE_SIZE, IMAGE_SIZE, 1] for the model
    const batched = tf.expandDims(normalized, 0);
    
    // Clean up intermediate tensors
    tfImage.dispose();
    resized.dispose();
    normalized.dispose();
    
    return batched as tf.Tensor4D;
  } catch (error) {
    console.error('Error preprocessing image:', error);
    throw error;
  }
}

/**
 * Process canvas for prediction - simplified version
 */
export async function preprocessCanvas(canvasDataUrl: string): Promise<tf.Tensor4D> {
  try {
    // Create a temporary file from the Data URL
    const tempFile = path.join(process.cwd(), 'uploads', `temp_${Date.now()}.png`);
    
    // Ensure uploads directory exists
    if (!fs.existsSync(path.dirname(tempFile))) {
      fs.mkdirSync(path.dirname(tempFile), { recursive: true });
    }
    
    // Extract base64 data
    const base64Data = canvasDataUrl.replace(/^data:image\/\w+;base64,/, '');
    // Save to temp file
    fs.writeFileSync(tempFile, Buffer.from(base64Data, 'base64'));
    
    // Preprocess the saved file
    const tensor = await preprocessImage(tempFile);
    
    // Clean up
    fs.unlinkSync(tempFile);
    
    return tensor;
  } catch (error) {
    console.error('Error preprocessing canvas:', error);
    throw error;
  }
}

/**
 * Train model on a batch of labeled images
 */
export async function trainOnBatch(
  examples: Array<{ tensor: tf.Tensor4D; label: string }>
): Promise<tf.History> {
  if (!model) {
    model = await initializeModel();
  }
  
  // Prepare inputs and targets (one-hot encoded)
  const batchSize = examples.length;
  
  // Convert all inputs to a single tensor of shape [batchSize, IMAGE_SIZE, IMAGE_SIZE, 1]
  const xs = tf.concat(examples.map(ex => ex.tensor));
  
  // Create one-hot encoded targets
  const ys = tf.buffer([batchSize, CHAR_SET.length]);
  
  examples.forEach((example, i) => {
    // Use only first character of label for simplicity
    const char = example.label.charAt(0);
    const charIndex = CHAR_SET.indexOf(char);
    
    if (charIndex !== -1) {
      ys.set(1, i, charIndex);
    } else {
      // If character is not in charset, use first character as default
      ys.set(1, i, 0);
      console.warn(`Character '${char}' not in charset, using '${CHAR_SET[0]}' instead`);
    }
  });
  
  // Train for a few epochs
  const history = await model.fit(xs, ys.toTensor(), {
    epochs: 10,
    batchSize: Math.min(32, batchSize),
    shuffle: true,
    verbose: 1
  });
  
  // Save the updated model
  await model.save(`file://${MODEL_PATH}`);
  
  // Clean up tensors
  xs.dispose();
  
  return history;
}

/**
 * Update model with a single labeled example
 */
export async function updateModelWithExample(
  imagePath: string,
  label: string
): Promise<tf.History> {
  const tensor = await preprocessImage(imagePath);
  return trainOnBatch([{ tensor, label }]);
}

/**
 * Recognize text from image
 */
export async function recognizeText(imageTensor: tf.Tensor4D): Promise<string> {
  if (!model) {
    model = await initializeModel();
  }
  
  // Get prediction
  const prediction = model.predict(imageTensor) as tf.Tensor;
  
  // Get max index (most likely character)
  const argMax = prediction.argMax(1);
  const index = (await argMax.data())[0];
  
  // Get the character from the charset
  const character = CHAR_SET.charAt(index);
  
  // Clean up tensors
  prediction.dispose();
  argMax.dispose();
  
  return character;
}

/**
 * Recognize text from canvas data URL
 */
export async function recognizeTextFromCanvas(canvasDataUrl: string): Promise<string> {
  const tensor = await preprocessCanvas(canvasDataUrl);
  const text = await recognizeText(tensor);
  
  // Clean up
  tensor.dispose();
  
  return text;
}

/**
 * Get model information
 */
export async function getModelInfo(): Promise<any> {
  ensureModelDir();
  
  const modelExists = fs.existsSync(MODEL_JSON_PATH);
  
  if (!modelExists) {
    return {
      exists: false,
      modelType: 'CNN Character Recognition',
      inputShape: [IMAGE_SIZE, IMAGE_SIZE, 1],
      outputShape: [CHAR_SET.length],
      numClasses: CHAR_SET.length,
      charSet: CHAR_SET
    };
  }
  
  if (!model) {
    try {
      model = await tf.loadLayersModel(`file://${MODEL_JSON_PATH}`);
    } catch (error) {
      console.error('Error loading model for info:', error);
      return {
        exists: false,
        modelType: 'CNN Character Recognition (Error loading)',
        inputShape: [IMAGE_SIZE, IMAGE_SIZE, 1],
        outputShape: [CHAR_SET.length],
        numClasses: CHAR_SET.length,
        charSet: CHAR_SET
      };
    }
  }
  
  return {
    exists: true,
    modelType: 'CNN Character Recognition',
    inputShape: model.inputs[0].shape,
    outputShape: model.outputs[0].shape,
    numClasses: CHAR_SET.length,
    charSet: CHAR_SET
  };
}