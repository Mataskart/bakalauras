import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, StatusBar
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import client from '../api/client';
import { removeToken } from '../storage/token';

const ACCENT = '#007ACC';
const BG = '#0e1117';
const SURFACE = '#161b22';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';
const DANGER = '#f85149';

export default function HomeScreen({ onLogout }) {
  const session = useRef(null);
  const [score, setScore] = useState(null);
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
    Accelerometer.setUpdateInterval(1000);
    accelSubscription.current = Accelerometer.addListener((data) => {
      accelerometerData.current = data;
    });

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
    if (s >= 80) return '#3fb950';
    if (s >= 50) return '#d29922';
    return DANGER;
  };

  const getScoreLabel = (s) => {
    if (s >= 80) return 'GREAT';
    if (s >= 50) return 'FAIR';
    return 'POOR';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>keliq</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>LOG OUT</Text>
        </TouchableOpacity>
      </View>

      {/* Score display */}
      <View style={styles.scoreArea}>
        {score !== null ? (
          <>
            <Text style={styles.scoreLabel}>DRIVE SCORE</Text>
            <Text style={[styles.score, { color: getScoreColor(score) }]}>
              {score}
            </Text>
            <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(score) + '22' }]}>
              <Text style={[styles.scoreBadgeText, { color: getScoreColor(score) }]}>
                {getScoreLabel(score)}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.scoreLabel}>DRIVE SCORE</Text>
            <Text style={styles.scorePlaceholder}>—</Text>
            <Text style={styles.scoreHint}>
              {tracking ? 'Calculating...' : 'Start a drive to see your score'}
            </Text>
          </>
        )}
      </View>

      {/* Tracking pulse indicator */}
      {tracking && (
        <View style={styles.recordingRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>RECORDING</Text>
        </View>
      )}

      {/* Main action button */}
      <View style={styles.buttonArea}>
        {loading ? (
          <ActivityIndicator size="large" color={ACCENT} />
        ) : (
          <TouchableOpacity
            style={[styles.driveButton, tracking ? styles.driveButtonStop : styles.driveButtonStart]}
            onPress={tracking ? handleStopSession : handleStartSession}
            activeOpacity={0.85}
          >
            <Text style={styles.driveButtonText}>
              {tracking ? 'STOP' : 'START'}
            </Text>
            <Text style={styles.driveButtonSub}>
              {tracking ? 'DRIVE' : 'DRIVE'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
  },
  logoutText: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 1.5,
  },
  scoreArea: {
    alignItems: 'center',
    marginBottom: 32,
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 2,
    marginBottom: 12,
  },
  score: {
    fontSize: 96,
    fontWeight: '800',
    letterSpacing: -4,
    lineHeight: 100,
  },
  scorePlaceholder: {
    fontSize: 96,
    fontWeight: '300',
    color: BORDER,
    lineHeight: 100,
  },
  scoreHint: {
    fontSize: 13,
    color: MUTED,
    marginTop: 12,
  },
  scoreBadge: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DANGER,
  },
  recordingText: {
    fontSize: 11,
    fontWeight: '700',
    color: DANGER,
    letterSpacing: 2,
  },
  buttonArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driveButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  driveButtonStart: {
    backgroundColor: ACCENT + '18',
    borderColor: ACCENT,
  },
  driveButtonStop: {
    backgroundColor: DANGER + '18',
    borderColor: DANGER,
  },
  driveButtonText: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: 2,
  },
  driveButtonSub: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    letterSpacing: 3,
    marginTop: 2,
  },
});