import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Button, ActivityIndicator, Alert } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useFaceDetector, FaceDetectorOptions } from 'react-native-vision-camera-face-detector';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Worklets, useRunOnJS } from 'react-native-worklets-core';

type LivenessState = 'WAITING' | 'BLINK' | 'TURN_LEFT' | 'TURN_RIGHT' | 'CAPTURING' | 'DONE';

export default function EnrollFaceScreen({ navigation }: any) {
  const { account, setHasMobileEnrollment } = useAuth();
  const device = useCameraDevice('front');
  const [hasPermission, setHasPermission] = useState(false);
  
  const [livenessState, setLivenessState] = useState<LivenessState>('WAITING');
  const [prompt, setPrompt] = useState('Look straight ahead');
  const [enrolling, setEnrolling] = useState(false);

  // Load TFLite model
  const tfliteModel = useTensorflowModel(require('../../android/app/src/main/assets/mobilefacenet.tflite'));

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleLivenessStateChange = useCallback((newState: LivenessState, newPrompt: string) => {
    setLivenessState(newState);
    setPrompt(newPrompt);
  }, []);

  const handleFaceEnrolled = useCallback(async (embedding: number[]) => {
    setEnrolling(true);
    setLivenessState('DONE');
    try {
      const { data, error } = await supabase.rpc('platform_enroll_face', {
        p_token: account?.token,
        p_embedding: embedding,
        p_model_version: 'mobilefacenet-mobile-v1',
      });
      if (error || !(data as any).ok) {
        Alert.alert('Error', error?.message || 'Failed to enroll face');
        setLivenessState('WAITING');
      } else {
        Alert.alert('Success', 'Face enrolled successfully!', [
          { text: 'OK', onPress: () => setHasMobileEnrollment(true) }
        ]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setLivenessState('WAITING');
    } finally {
      setEnrolling(false);
    }
  }, [account, navigation]);

  const jsHandleLiveness = useRunOnJS(handleLivenessStateChange, [handleLivenessStateChange]);
  const jsHandleFaceEnrolled = useRunOnJS(handleFaceEnrolled, [handleFaceEnrolled]);

  const faceDetector = useFaceDetector({
    performanceMode: 'fast',
    runLandmarks: true,
    runContours: false,
    runClassifications: true,
  });

  const [blinked, setBlinked] = useState(false);
  const [turnedLeft, setTurnedLeft] = useState(false);
  const [turnedRight, setTurnedRight] = useState(false);

  // Note: in a real implementation, we would extract a 112x112 crop here, pass it to TFLite, 
  // and send the 192-d output. Because we don't have a native image resizer in this POC phase,
  // we mock the TFLite execution output if liveness passes for this implementation simulation.
  // The structure is preserved to demonstrate the vision-camera + frame processor integration.
  
  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text>Camera permission is required.</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Text>No front camera found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!enrolling && livenessState !== 'DONE'}
        // frameProcessor setup omitted here as it requires react-native-worklets-core deep integration
        // and would be implemented using `useFrameProcessor` + `faceDetector.detectFaces(frame)`
      />
      
      <View style={styles.overlay}>
        <Text style={styles.prompt}>{prompt}</Text>
        {enrolling && <ActivityIndicator size="large" color="#fff" />}
        <Button 
          title="[Simulate Pass Liveness & Enroll]" 
          onPress={() => {
            // Mocking a 192-d embedding from mobilefacenet
            const mockEmbedding = Array(192).fill(0).map(() => Math.random() * 2 - 1);
            handleFaceEnrolled(mockEmbedding);
          }} 
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
    borderRadius: 10,
  },
  prompt: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  }
});
