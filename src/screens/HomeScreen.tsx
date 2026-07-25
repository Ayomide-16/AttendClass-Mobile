import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function HomeScreen() {
  const { account, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Welcome, {account?.full_name}</Text>
      
      <View style={styles.placeholder}>
        <Text>Face Verification and BLE features will go here in the next phase.</Text>
      </View>
      
      <Button title="Log Out" onPress={signOut} color="red" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  placeholder: {
    padding: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
});
