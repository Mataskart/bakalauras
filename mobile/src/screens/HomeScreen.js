import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import client from '../api/client';
import { removeToken } from '../storage/token';

export default function HomeScreen({ onLogout }) {
  const session = useRef(null);       // active session object
  const [score, setScore] = useState(null);            // current score
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);

  const accelerometerData = useRef({ x: 0, y: 0, z: 0 });
  const locationData = useRef({ latitude: 0, longitude: 0 });
  const intervalRef = useRef(null);
  const accelSubscription = useRef(null);

  useEffect(() => {
    requestPermissions();
    return () => stopTracking();
  }, []);

  const requestPermissions = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Location access is needed to track your drive.');
    }
  };

  const startTracking = () => {
    // Subscribe to accelerometer at 1 reading per second
    Accelerometer.setUpdateInterval(1000);
    accelSubscription.current = Accelerometer.addListener((data) => {
      accelerometerData.current = data;
    });

    // Send a batch of events to the backend every 5 seconds
    intervalRef.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({});
        locationData.current = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        const response = await client.post(`/sessions/${session.current.id}/events`, [{
          latitude: locationData.current.latitude,
          longitude: locationData.current.longitude,
          accelerationX: accelerometerData.current.x,
          accelerationY: accelerometerData.current.y,
          accelerationZ: accelerometerData.current.z,
        }]);

        setScore(response.data.currentScore);
      } catch (error) {
        console.log('Event send error:', error.message);
      }
    }, 5000);

    setTracking(true);
  };

  const stopTracking = () => {
    if (accelSubscription.current) {
      accelSubscription.current.remove();
      accelSubscription.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
  };

const handleStartSession = async () => {
    setLoading(true);
    try {
      const response = await client.post('/sessions');
      session.current = response.data;
      setScore(null);
      startTracking();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Could not start session');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSession = async () => {
    setLoading(true);
    stopTracking();
    try {
      const response = await client.patch(`/sessions/${session.current.id}/stop`);
      setScore(response.data.score);
      session.current = null;
    } catch (error) {
      Alert.alert('Error', 'Could not stop session');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    stopTracking();
    await removeToken();
    onLogout();
  };

  const getScoreColor = (s) => {
    if (s >= 80) return '#2ecc71';
    if (s >= 50) return '#f39c12';
    return '#e74c3c';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>keliq</Text>

      {score !== null && (
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>Current Score</Text>
          <Text style={[styles.score, { color: getScoreColor(score) }]}>
            {score}
          </Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>
      )}

      {tracking && (
        <View style={styles.trackingIndicator}>
          <Text style={styles.trackingText}>● Recording...</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#1a1a2e" style={{ marginTop: 32 }} />
      ) : (
        <TouchableOpacity
          style={[styles.button, tracking ? styles.buttonStop : styles.buttonStart]}
          onPress={tracking ? handleStopSession : handleStartSession}
        >
          <Text style={styles.buttonText}>
            {tracking ? 'Stop Drive' : 'Start Drive'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 48,
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 32,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreLabel: {
    fontSize: 18,
    color: '#666',
    marginRight: 12,
  },
  score: {
    fontSize: 72,
    fontWeight: 'bold',
  },
  scoreMax: {
    fontSize: 24,
    color: '#999',
    marginLeft: 4,
  },
  trackingIndicator: {
    marginBottom: 24,
  },
  trackingText: {
    color: '#e74c3c',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    padding: 20,
    borderRadius: 50,
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  buttonStart: {
    backgroundColor: '#1a1a2e',
  },
  buttonStop: {
    backgroundColor: '#e74c3c',
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  logoutButton: {
    marginTop: 16,
  },
  logoutText: {
    color: '#999',
    fontSize: 14,
  },
});