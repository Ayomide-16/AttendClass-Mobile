import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Button, ActivityIndicator, Alert } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useFaceDetector, FaceDetectorOptions } from 'react-native-vision-camera-face-detector';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useFaceProcessor, LivenessState } from '../hooks/useFaceProcessor';
export default function EnrollFaceScreen({ navigation }: any) {
  const { account, setHasMobileEnrollment } = useAuth();
  const device = useCameraDevice('front');
  const [hasPermission, setHasPermission] = useState(false);
  
  const [uiLivenessState, setUiLivenessState] = useState<LivenessState>('WAITING');
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
    setUiLivenessState(newState);
    setPrompt(newPrompt);
  }, []);

  const handleFaceEnrolled = useCallback(async (embedding: number[]) => {
    setEnrolling(true);
    setUiLivenessState('DONE');
    try {
      const { data, error } = await supabase.rpc('platform_enroll_face', {
        p_token: account?.token,
        p_embedding: JSON.stringify(embedding),
        p_model_version: 'mobilefacenet-mobile-v1',
      });
      if (error || !(data as any).ok) {
        Alert.alert('Error', error?.message || 'Failed to enroll face');
        setUiLivenessState('WAITING');
      } else {
        Alert.alert('Success', 'Face enrolled successfully!', [
          { text: 'OK', onPress: () => setHasMobileEnrollment(true) }
        ]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setUiLivenessState('WAITING');
    } finally {
      setEnrolling(false);
    }
  }, [account, navigation]);

  const { frameProcessor, livenessState: sharedLivenessState } = useFaceProcessor({
    onLivenessChange: handleLivenessStateChange,
    onFaceEmbedding: handleFaceEnrolled,
    tfliteModel,
  });


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
        pixelFormat="rgb"
        isActive={!enrolling && uiLivenessState !== 'DONE'}
        frameProcessor={frameProcessor}
      />
      
      <View style={styles.overlay}>
        <Text style={styles.prompt}>{prompt}</Text>
        {enrolling && <ActivityIndicator size="large" color="#fff" />}
        {__DEV__ && (
          <Button 
            title="[DEV Bypass Liveness]" 
            onPress={() => {
              const mockEmbedding = Array(192).fill(0).map(() => Math.random() * 2 - 1);
              handleFaceEnrolled(mockEmbedding);
            }} 
          />
        )}
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
