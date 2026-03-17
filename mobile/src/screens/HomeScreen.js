import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, StatusBar
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import client from '../api/client';

const ACCENT = '#007ACC';
const BG = '#0e1117';
const SURFACE = '#161b22';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';
const DANGER = '#f85149';

export default function HomeScreen() {
  const session = useRef(null);
  const [score, setScore] = useState(null);
  const [speedLimit, setSpeedLimit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);

  const accelerometerData = useRef({ x: 0, y: 0, z: 0 });
  const peakAccelerometer = useRef({ x: 0, y: 0, z: 0 });
  const gravity = useRef({ x: 0, y: 0, z: 0 });
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

  const startTracking = async () => {
    Accelerometer.setUpdateInterval(100);
    accelSubscription.current = Accelerometer.addListener((data) => {
      const alpha = 0.8;

      // Low-pass filter isolates the gravity component
      gravity.current = {
        x: alpha * gravity.current.x + (1 - alpha) * data.x,
        y: alpha * gravity.current.y + (1 - alpha) * data.y,
        z: alpha * gravity.current.z + (1 - alpha) * data.z,
      };

      // Subtract gravity to get only motion-induced acceleration
      const linear = {
        x: data.x - gravity.current.x,
        y: data.y - gravity.current.y,
        z: data.z - gravity.current.z,
      };

      accelerometerData.current = linear;

      // Track peak linear acceleration within the 2s window
      peakAccelerometer.current = {
        x: Math.abs(linear.x) > Math.abs(peakAccelerometer.current.x) ? linear.x : peakAccelerometer.current.x,
        y: Math.abs(linear.y) > Math.abs(peakAccelerometer.current.y) ? linear.y : peakAccelerometer.current.y,
        z: Math.abs(linear.z) > Math.abs(peakAccelerometer.current.z) ? linear.z : peakAccelerometer.current.z,
      };
    });

    intervalRef.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({});
        locationData.current = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        // Speed from GPS (m/s); convert to km/h for API. -1 or null = unavailable.
        const speedMs = location.coords.speed;
        const speedKmh = (speedMs != null && speedMs >= 0) ? speedMs * 3.6 : undefined;

        // Send the peak reading from this window, not just the latest
        const peak = peakAccelerometer.current;
        const payload = {
          latitude: locationData.current.latitude,
          longitude: locationData.current.longitude,
          accelerationX: peak.x * 9.8,
          accelerationY: peak.y * 9.8,
          accelerationZ: peak.z * 9.8,
        };
        if (speedKmh !== undefined) payload.speed = speedKmh;

        const response = await client.post(`/sessions/${session.current.id}/events`, [payload]);

        // Reset peak so the next window starts fresh
        peakAccelerometer.current = { x: 0, y: 0, z: 0 };

        setScore(response.data.currentScore);
        setSpeedLimit(response.data.speedLimitKmh ?? null);
      } catch (error) {
        console.log('Event send error:', error.message);
      }
    }, 2000);

    await activateKeepAwakeAsync();
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
    peakAccelerometer.current = { x: 0, y: 0, z: 0 };
    gravity.current = { x: 0, y: 0, z: 0 };
    deactivateKeepAwake();
    setTracking(false);
  };

  const handleStartSession = async () => {
    setLoading(true);
    try {
      const response = await client.post('/sessions');
      session.current = response.data;
      setScore(null);
      setSpeedLimit(null);
      await startTracking();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Could not start session');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSession = async () => {
    setLoading(true);
    stopTracking();
    setSpeedLimit(null);
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

      <View style={styles.header}>
        <Text style={styles.title}>keliq</Text>
      </View>

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

      {tracking && (
        <View style={styles.recordingRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>RECORDING</Text>
        </View>
      )}

      {tracking && (
        <View style={styles.speedLimitRow}>
          <Text style={styles.speedLimitLabel}>SPEED LIMIT</Text>
          <Text style={styles.speedLimitValue}>
            {speedLimit != null ? `${Math.round(speedLimit)} km/h` : '—'}
          </Text>
        </View>
      )}

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
              DRIVE
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
  speedLimitRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  speedLimitLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 2,
    marginBottom: 4,
  },
  speedLimitValue: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
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