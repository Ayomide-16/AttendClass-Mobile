import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function ResetPasswordScreen() {
  const { forceSetPassword, signOut } = useAuth();
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (newPass !== confirmPass) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    setError('');
    
    const res = await forceSetPassword(currentPass, newPass);
    if (res.error) {
      setError(res.error);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Password Required</Text>
      <Text style={styles.subtitle}>You must change your default password to continue.</Text>
      
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      <TextInput
        style={styles.input}
        placeholder="Current Password"
        value={currentPass}
        onChangeText={setCurrentPass}
        secureTextEntry
      />
      
      <TextInput
        style={styles.input}
        placeholder="New Password"
        value={newPass}
        onChangeText={setNewPass}
        secureTextEntry
      />
      
      <TextInput
        style={styles.input}
        placeholder="Confirm New Password"
        value={confirmPass}
        onChangeText={setConfirmPass}
        secureTextEntry
      />
      
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <View style={styles.buttons}>
          <Button title="Update Password" onPress={handleReset} />
          <View style={{ height: 10 }} />
          <Button title="Log Out" color="red" onPress={signOut} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  error: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
  buttons: {
    marginTop: 10,
  },
});
