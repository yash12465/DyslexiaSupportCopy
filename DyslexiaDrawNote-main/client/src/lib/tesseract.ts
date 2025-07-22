import { createWorker } from 'tesseract.js';

interface RecognitionResult {
  text: string;
  suggestions: Array<{
    original: string;
    correction: string;
  }>;
  formattedText: string; // Added for improved font styling
}

// Pre-process the image to improve recognition
async function preprocessImage(imageData: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      // Create an offscreen canvas for image processing
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageData);
        return;
      }
      
      // Draw the original image
      ctx.drawImage(img, 0, 0);
      
      // Get image data for processing
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      
      // Apply image enhancements for better recognition
      for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale with improved contrast
        const brightness = 0.34 * data[i] + 0.5 * data[i + 1] + 0.16 * data[i + 2];
        
        // Apply thresholding to make text stand out more
        const threshold = 180;
        const value = brightness < threshold ? 0 : 255;
        
        // Set RGB values to the new value
        data[i] = value;     // Red
        data[i + 1] = value; // Green
        data[i + 2] = value; // Blue
        // Alpha channel remains unchanged
      }
      
      // Put processed image data back to canvas
      ctx.putImageData(imgData, 0, 0);
      
      // Return processed image as data URL
      resolve(canvas.toDataURL());
    };
    
    img.src = imageData;
  });
}
export async function recognizeText(imageDataUrl: string) {
  const blob = await (await fetch(imageDataUrl)).blob();
  const formData = new FormData();
  formData.append("image", blob, "input.png");

  const response = await fetch("/api/recognize-text", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Recognition failed");
  }

  return await response.json();
}


// Format recognized text to standardized computer fonts
function formatToStandardFont(text: string): string {
  // Format the text with appropriate line breaks and spacing
  return text
    .replace(/\n{3,}/g, '\n\n') // Replace multiple line breaks with double line break
    .replace(/\s{2,}/g, ' ')    // Replace multiple spaces with single space
    .trim();                    // Remove leading and trailing whitespace
}


