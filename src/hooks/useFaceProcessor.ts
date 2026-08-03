import { useSharedValue } from 'react-native-worklets-core';
import { Worklets } from 'react-native-worklets-core';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Images } from 'react-native-nitro-image';

export type LivenessState = 'WAITING' | 'BLINK' | 'TURN_LEFT' | 'TURN_RIGHT' | 'CAPTURING' | 'DONE';

interface UseFaceProcessorOptions {
  onLivenessChange: (state: LivenessState, prompt: string) => void;
  onFaceEmbedding: (embedding: number[]) => void;
  tfliteModel: any;
}

export function useFaceProcessor({ onLivenessChange, onFaceEmbedding, tfliteModel }: UseFaceProcessorOptions) {
  const livenessState = useSharedValue<LivenessState>('WAITING');
  const jsHandleLiveness = Worklets.createRunOnJS(onLivenessChange);
  const jsHandleFaceEnrolled = Worklets.createRunOnJS(onFaceEmbedding);

  const jsHandleSanityCheck = Worklets.createRunOnJS((imageObj: any) => {
    if (imageObj && imageObj.saveToTemporaryFileAsync) {
      imageObj.saveToTemporaryFileAsync('jpg', 90)
        .then((path: string) => {
          console.log(`\n\n[FaceCrop Sanity Check] Saved 112x112 face crop to: file://${path}\n\n`);
        })
        .catch((e: any) => console.log('Sanity check save error:', e));
    }
  });

  const faceDetector = useFaceDetector({
    performanceMode: 'fast',
    runLandmarks: true,
    runContours: false,
    runClassifications: true,
  });

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    
    if (livenessState.value === 'DONE') return;

    const faces = faceDetector.detectFaces(frame);
    if (faces.length === 0) {
      if (livenessState.value !== 'WAITING') {
        livenessState.value = 'WAITING';
        jsHandleLiveness('WAITING', 'Face lost. Look straight ahead.');
      }
      return;
    }

    const face = faces[0];
    const { leftEyeOpenProbability = 1, rightEyeOpenProbability = 1, yawAngle } = face;

    if (livenessState.value === 'WAITING') {
      if (leftEyeOpenProbability < 0.2 && rightEyeOpenProbability < 0.2) {
        livenessState.value = 'BLINK';
        jsHandleLiveness('BLINK', 'Blink detected! Now turn your head left.');
      }
    } else if (livenessState.value === 'BLINK') {
      if (yawAngle < -20) {
        livenessState.value = 'TURN_LEFT';
        jsHandleLiveness('TURN_LEFT', 'Great! Now turn your head right.');
      }
    } else if (livenessState.value === 'TURN_LEFT') {
      if (yawAngle > 20) {
        livenessState.value = 'CAPTURING';
        jsHandleLiveness('CAPTURING', 'Perfect! Capturing face...');
      }
    } else if (livenessState.value === 'CAPTURING') {
      if (!tfliteModel?.model) {
        livenessState.value = 'DONE';
        jsHandleLiveness('DONE', 'Model not ready');
        return;
      }
      
      try {
        livenessState.value = 'DONE'; // Prevent multiple captures
        
        // 1. Convert Frame to ArrayBuffer
        const buffer = frame.toArrayBuffer();
        
        // Map Vision-Camera pixel formats to Nitro-Image pixel formats
        let nitroPixelFormat: "RGBA" | "BGRA" | "ARGB" | "RGB" | "unknown" = "unknown";
        const fp = frame.pixelFormat.toLowerCase();
        if (fp.includes('rgba')) {
          nitroPixelFormat = 'RGBA';
        } else if (fp.includes('bgra')) {
          nitroPixelFormat = 'BGRA';
        } else if (fp.includes('argb')) {
          nitroPixelFormat = 'ARGB';
        } else if (fp.includes('rgb')) {
          nitroPixelFormat = 'RGB';
        }

        // 2. Load into Nitro Image
        const image = Images.loadFromRawPixelData({
          buffer: buffer,
          width: frame.width,
          height: frame.height,
          pixelFormat: nitroPixelFormat
        });
        
        // 3. Crop to face bounds
        const bounds = face.bounds;
        // Clamp bounds to prevent crashes
        const startX = Math.max(0, bounds.x);
        const startY = Math.max(0, bounds.y);
        const endX = Math.min(frame.width, bounds.x + bounds.width);
        const endY = Math.min(frame.height, bounds.y + bounds.height);
        
        const cropped = image.crop(startX, startY, endX, endY);
        
        // 4. Resize to 112x112 for MobileFaceNet
        const resized = cropped.resize(112, 112);
        
        // Sanity Check: send to JS thread to save and log
        jsHandleSanityCheck(resized);
        
        // 5. Get raw bytes and convert to Float32 array
        // Nitro Image returns bytes depending on OS (ARGB or BGRA)
        const outputData = resized.toRawPixelData();
        const rgba = new Uint8Array(outputData.buffer);
        const rgbFloat = new Float32Array(112 * 112 * 3);
        
        // MobileFaceNet expects -1 to 1 normalized RGB
        // We will assume RGBA/BGRA byte array and just grab the first 3 bytes of each 4-byte pixel.
        // NOTE: Actually, if it's ARGB or BGRA, we should check `outputData.pixelFormat`.
        let isBGRA = outputData.pixelFormat === 'BGRA' || outputData.pixelFormat === 'bgra' as any;
        let isARGB = outputData.pixelFormat === 'ARGB' || outputData.pixelFormat === 'argb' as any;
        
        let j = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          let r, g, b;
          if (isBGRA) {
            b = rgba[i];
            g = rgba[i + 1];
            r = rgba[i + 2];
          } else if (isARGB) {
            r = rgba[i + 1];
            g = rgba[i + 2];
            b = rgba[i + 3];
          } else {
            // Assume RGBA
            r = rgba[i];
            g = rgba[i + 1];
            b = rgba[i + 2];
          }
          
          rgbFloat[j++] = ((r / 255.0) - 0.5) * 2.0;
          rgbFloat[j++] = ((g / 255.0) - 0.5) * 2.0;
          rgbFloat[j++] = ((b / 255.0) - 0.5) * 2.0;
        }
        
        // 6. Run TFLite inference
        const outputBuffers = tfliteModel.model.runSync([rgbFloat.buffer]);
        const embeddingBuffer = outputBuffers[0];
        const embeddingArray = Array.from(new Float32Array(embeddingBuffer));
        
        // 7. Pass back to JS thread
        jsHandleFaceEnrolled(embeddingArray);
        
      } catch (e: any) {
        // Fallback for errors in worklet (e.g. out of memory, unsupported pixel format)
        // We pass the error back so it doesn't crash the UI thread silently.
        // And reset state to WAITING so the user can try again or use __DEV__ bypass.
        livenessState.value = 'WAITING';
        jsHandleLiveness('WAITING', `Error: ${e.message}. Use Bypass in DEV.`);
      }
    }
  }, [faceDetector, livenessState, tfliteModel, jsHandleLiveness, jsHandleFaceEnrolled, jsHandleSanityCheck]);

  return { frameProcessor, livenessState };
}
