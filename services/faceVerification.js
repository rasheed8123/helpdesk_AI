const fs = require('fs').promises;
const path = require('path');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// Set environment to browser to use browser version of TensorFlow.js
process.env.TFJS_BACKEND = 'cpu';

class FaceVerificationService {
  constructor() {
    this.uploadDir = path.join(__dirname, '../uploads/faces');
    this.modelsDir = path.join(__dirname, '../models');
    this.ensureUploadDir();
    this.initializeFaceAPI();
  }

  async ensureUploadDir() {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async initializeFaceAPI() {
    try {
      // Load face-api models
      await faceapi.nets.tinyFaceDetector.loadFromDisk(this.modelsDir);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsDir);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsDir);
      console.log('Face-API models loaded successfully');
    } catch (error) {
      console.error('Error loading face-api models:', error);
      throw new Error('Failed to initialize face recognition');
    }
  }

  async saveFaceImage(userId, imageBuffer) {
    const filename = `${userId}-face.jpg`;
    const filepath = path.join(this.uploadDir, filename);
    await fs.writeFile(filepath, imageBuffer);
    return filepath;
  }

  async getFaceDescriptor(imageBuffer) {
    try {
      if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
        throw new Error('Invalid image buffer');
      }

      // Create image from buffer
      const img = await canvas.loadImage(imageBuffer);
      
      // Configure face detection options
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: 0.3
      });

      // Detect all faces with landmarks and descriptors
      const detections = await faceapi
        .detectAllFaces(img, options)
        .withFaceLandmarks()
        .withFaceDescriptors();

      console.log(`Found ${detections.length} faces in the image`);

      if (detections.length === 0) {
        throw new Error('No face detected in the image');
      }

      // Get the largest face (usually the main subject)
      const largestFace = detections.reduce((prev, current) => {
        const prevArea = prev.detection.box.width * prev.detection.box.height;
        const currentArea = current.detection.box.width * current.detection.box.height;
        return currentArea > prevArea ? current : prev;
      });

      if (!largestFace || !largestFace.descriptor) {
        throw new Error('Failed to extract face features');
      }

      // Convert descriptor to array if it's not already
      const descriptor = Array.from(largestFace.descriptor);
      console.log('Successfully extracted face descriptor');
      return descriptor;
    } catch (error) {
      console.error('Error getting face descriptor:', error);
      throw new Error('Failed to process face image: ' + error.message);
    }
  }

  async compareFaces(descriptor1, descriptor2) {
    try {
      if (!descriptor1 || !descriptor2) {
        console.error('Missing descriptors:', { 
          descriptor1: descriptor1 ? 'present' : 'missing',
          descriptor2: descriptor2 ? 'present' : 'missing'
        });
        throw new Error('Missing face descriptors');
      }

      // Ensure descriptors are arrays
      const d1 = Array.isArray(descriptor1) ? descriptor1 : Array.from(descriptor1);
      const d2 = Array.isArray(descriptor2) ? descriptor2 : Array.from(descriptor2);

      if (d1.length !== d2.length) {
        console.error('Descriptor length mismatch:', {
          length1: d1.length,
          length2: d2.length
        });
        throw new Error('Face descriptors have different lengths');
      }

      // Calculate Euclidean distance between descriptors
      const distance = faceapi.euclideanDistance(d1, d2);
      
      // Threshold for face match (lower distance means better match)
      const MATCH_THRESHOLD = 0.6;
      
      console.log('Face distance score:', distance);
      return distance <= MATCH_THRESHOLD;
    } catch (error) {
      console.error('Error comparing faces:', error);
      throw new Error('Failed to compare faces: ' + error.message);
    }
  }

  async verifyFace(userId, newFaceBuffer) {
    try {
      if (!userId || !newFaceBuffer) {
        throw new Error('Missing required parameters');
      }

      // Read stored face image
      const storedFacePath = path.join(this.uploadDir, `${userId}-face.jpg`);
      
      try {
        await fs.access(storedFacePath);
      } catch {
        throw new Error('No face image found for this user');
      }

      const storedFaceBuffer = await fs.readFile(storedFacePath);

      // Get descriptors for both faces
      console.log('Getting descriptor for stored face...');
      const storedDescriptor = await this.getFaceDescriptor(storedFaceBuffer);
      console.log('Getting descriptor for new face...');
      const newDescriptor = await this.getFaceDescriptor(newFaceBuffer);

      // Compare faces
      console.log('Comparing faces...');
      const isMatch = await this.compareFaces(storedDescriptor, newDescriptor);

      return isMatch;
    } catch (error) {
      console.error('Error verifying face:', error);
      throw new Error('Failed to verify face: ' + error.message);
    }
  }
}

module.exports = new FaceVerificationService(); 