import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Button, ActivityIndicator, Alert } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { BleManager, Device } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useFaceProcessor, LivenessState } from '../hooks/useFaceProcessor';

type FlowStep = 'IDLE' | 'VERIFY_FACE' | 'CONNECT_BLE' | 'SUCCESS' | 'ALREADY_LOGGED' | 'FAILED';

export default function CheckInScreen({ navigation }: any) {
  const { account } = useAuth();
  const device = useCameraDevice('front');
  const [hasPermission, setHasPermission] = useState(false);
  
  const [step, setStep] = useState<FlowStep>('VERIFY_FACE');
  const [uiLivenessState, setUiLivenessState] = useState<LivenessState>('WAITING');
  const [prompt, setPrompt] = useState('Look straight ahead');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [faceSimilarity, setFaceSimilarity] = useState<number | null>(null);
  
  const bleManagerRef = useRef<BleManager | null>(null);

  // Load TFLite model
  const tfliteModel = useTensorflowModel(require('../../android/app/src/main/assets/mobilefacenet.tflite'));

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
    
    bleManagerRef.current = new BleManager();
    return () => {
      bleManagerRef.current?.destroy();
    };
  }, []);

  const handleLivenessStateChange = useCallback((newState: LivenessState, newPrompt: string) => {
    setUiLivenessState(newState);
    setPrompt(newPrompt);
  }, []);

  const handleFaceMatch = useCallback(async (embedding: number[]) => {
    setUiLivenessState('DONE');
    try {
      const { data, error } = await supabase.rpc('platform_verify_face', {
        p_token: account?.token,
        p_embedding: JSON.stringify(embedding),
      });

      if (error) throw new Error(error.message);

      const res = data as any;
      if (!res.match) {
        throw new Error(res.error || `Face not recognized (Similarity: ${(res.similarity * 100).toFixed(1)}%)`);
      }

      // Match success
      setFaceSimilarity(res.similarity);
      setStep('CONNECT_BLE');
      startBleScan(res.similarity);
    } catch (e: any) {
      setErrorMsg(e.message);
      setStep('FAILED');
    }
  }, [account]);

  const { frameProcessor } = useFaceProcessor({
    onLivenessChange: handleLivenessStateChange,
    onFaceEmbedding: handleFaceMatch,
    tfliteModel,
  });

  const startBleScan = (similarity: number) => {
    if (!bleManagerRef.current) return;
    
    setPrompt('Scanning for class beacon...');
    
    const timeoutId = setTimeout(() => {
      bleManagerRef.current?.stopDeviceScan();
      setErrorMsg('Timed out waiting for BLE broadcast.');
      setStep('FAILED');
    }, 15000);

    bleManagerRef.current.startDeviceScan(null, { allowDuplicates: false }, async (error, scannedDevice) => {
      if (error) {
        clearTimeout(timeoutId);
        setErrorMsg(error.message);
        setStep('FAILED');
        return;
      }

      if (scannedDevice && scannedDevice.name?.startsWith('AttendESP_') && scannedDevice.manufacturerData) {
        try {
          bleManagerRef.current?.stopDeviceScan();
          clearTimeout(timeoutId);
          setPrompt('Broadcast received! Verifying check-in...');
          
          // Parse manufacturerData
          const buffer = Buffer.from(scannedDevice.manufacturerData, 'base64');
          
          // Byte 0-1 is company ID (should be 0xFF 0xFF for AttendESP_)
          if (buffer.length < 9) throw new Error('Invalid manufacturer data length');
          
          // Byte 2-5: Short Code (UInt32 Big Endian)
          const shortCode = buffer.readUInt32BE(2).toString();
          
          // Byte 6-8: TOTP packed as BCD
          let token = '';
          for (let i = 6; i < 9; i++) {
            const byte = buffer[i];
            const high = (byte >> 4) & 0x0F;
            const low = byte & 0x0F;
            token += high.toString() + low.toString();
          }
          
          const rssi = scannedDevice.rssi || -99;
          
          const { data, error: rpcError } = await supabase.functions.invoke('verify-checkin', {
            body: {
              session_token: account?.token,
              ble_short_code: shortCode,
              ble_token: token,
              rssi: rssi,
              face_similarity: similarity,
            }
          });

          if (rpcError) {
            const serverErr = data?.error || rpcError.message;
            if (serverErr === 'invalid_token') {
              throw new Error('Invalid BLE token. Please move closer to the class device and try again.');
            } else if (serverErr === 'out_of_range') {
              throw new Error('Move closer to the device and try again.');
            }
            throw new Error(serverErr || 'Check-in verification failed');
          }

          if (!data?.ok) {
            throw new Error(data?.error || 'Failed to log attendance');
          }

          if (data.already_logged_today) {
            setStep('ALREADY_LOGGED');
          } else {
            setStep('SUCCESS');
          }

        } catch (err: any) {
          setErrorMsg(err.message);
          setStep('FAILED');
        }
      }
    });
  };

  const retry = () => {
    setStep('VERIFY_FACE');
    setErrorMsg(null);
    setFaceSimilarity(null);
    setUiLivenessState('WAITING');
    setPrompt('Look straight ahead');
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text>Camera permission is required.</Text>
      </View>
    );
  }

  if (step === 'VERIFY_FACE') {
    return (
      <View style={styles.container}>
        {device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            pixelFormat="rgb"
            isActive={uiLivenessState !== 'DONE'}
            frameProcessor={frameProcessor}
          />
        ) : (
          <Text>No camera available.</Text>
        )}
        
        <View style={styles.overlay}>
          <Text style={styles.prompt}>{prompt}</Text>
          {uiLivenessState === 'DONE' && <ActivityIndicator size="large" color="#fff" />}
          {__DEV__ && (
            <Button 
              title="[DEV Bypass Liveness]" 
              onPress={() => {
                const mockEmbedding = Array(192).fill(0).map(() => Math.random() * 2 - 1);
                handleFaceMatch(mockEmbedding);
              }} 
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.messageBox}>
        {step === 'CONNECT_BLE' && (
          <>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.statusText}>{prompt}</Text>
          </>
        )}
        
        {step === 'SUCCESS' && (
          <>
            <Text style={styles.emoji}>✅</Text>
            <Text style={styles.title}>Check-In Successful</Text>
            <Text style={styles.text}>Your attendance has been securely verified and logged.</Text>
            <Button title="Done" onPress={() => navigation.goBack()} />
          </>
        )}

        {step === 'ALREADY_LOGGED' && (
          <>
            <Text style={styles.emoji}>📋</Text>
            <Text style={styles.title}>Already Checked In</Text>
            <Text style={styles.text}>You already checked in for this class today.</Text>
            <Button title="Done" onPress={() => navigation.goBack()} />
          </>
        )}

        {step === 'FAILED' && (
          <>
            <Text style={styles.emoji}>❌</Text>
            <Text style={styles.title}>Verification Failed</Text>
            <Text style={styles.text}>{errorMsg}</Text>
            <View style={styles.buttonRow}>
              <Button title="Try Again" onPress={retry} />
              <View style={{ width: 10 }} />
              <Button title="Cancel" color="gray" onPress={() => navigation.goBack()} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
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
    textAlign: 'center',
  },
  messageBox: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    width: '85%',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  text: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  statusText: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  }
});
