import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, StatusBar, AppState
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import client from '../api/client';
import {
  getBuffer,
  appendToBuffer,
  clearBuffer,
  trimStationaryTail,
  hasBeenStationaryFor15Min,
} from '../driveBuffer';
import { uploadDriveAndClear } from '../uploadDrive';
import {
  startBackgroundWatching,
  stopBackgroundUpdates,
  isBackgroundRecording,
  completeCurrentDriveAndStop,
  pauseBackgroundRecording,
  resumeBackgroundRecording,
} from '../backgroundLocation';
import { getAutoDetect, setAutoDetect as persistAutoDetect } from '../storage/autoDetect';

const ACCENT = '#007ACC';
const BG = '#0e1117';
const SURFACE = '#161b22';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';
const DANGER = '#f85149';

const BATCH_SIZE = 50;

export default function HomeScreen() {
  const [score, setScore] = useState(null);
  const [speedLimit, setSpeedLimit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [autoDetectLoaded, setAutoDetectLoaded] = useState(false);

  const accelerometerData = useRef({ x: 0, y: 0, z: 0 });
  const peakAccelerometer = useRef({ x: 0, y: 0, z: 0 });
  const gravity = useRef({ x: 0, y: 0, z: 0 });
  const intervalRef = useRef(null);
  const accelSubscription = useRef(null);
  const autoCompleteCheckRef = useRef(null);

  useEffect(() => {
    getAutoDetect().then((v) => {
      setAutoDetect(v);
      setAutoDetectLoaded(true);
    });
  }, []);

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

  const pushOneEvent = async (location, peak) => {
    const speedMs = location.coords.speed;
    const speedKmh = (speedMs != null && speedMs >= 0) ? speedMs * 3.6 : undefined;
    const event = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accelerationX: peak.x * 9.8,
      accelerationY: peak.y * 9.8,
      accelerationZ: peak.z * 9.8,
      recordedAt: new Date().toISOString(),
    };
    if (speedKmh !== undefined) event.speed = speedKmh;
    await appendToBuffer([event]);
  };

  const startTracking = () => {
    Accelerometer.setUpdateInterval(100);
    accelSubscription.current = Accelerometer.addListener((data) => {
      const alpha = 0.8;
      gravity.current = {
        x: alpha * gravity.current.x + (1 - alpha) * data.x,
        y: alpha * gravity.current.y + (1 - alpha) * data.y,
        z: alpha * gravity.current.z + (1 - alpha) * data.z,
      };
      const linear = {
        x: data.x - gravity.current.x,
        y: data.y - gravity.current.y,
        z: data.z - gravity.current.z,
      };
      accelerometerData.current = linear;
      peakAccelerometer.current = {
        x: Math.abs(linear.x) > Math.abs(peakAccelerometer.current.x) ? linear.x : peakAccelerometer.current.x,
        y: Math.abs(linear.y) > Math.abs(peakAccelerometer.current.y) ? linear.y : peakAccelerometer.current.y,
        z: Math.abs(linear.z) > Math.abs(peakAccelerometer.current.z) ? linear.z : peakAccelerometer.current.z,
      };
    });

    intervalRef.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({});
        const peak = peakAccelerometer.current;
        await pushOneEvent(location, peak);
        peakAccelerometer.current = { x: 0, y: 0, z: 0 };

        if (autoDetect) {
          const speedMs = location.coords.speed;
          const speedKmh = (speedMs != null && speedMs >= 0) ? speedMs * 3.6 : 0;
          const buffer = await getBuffer();
          if (hasBeenStationaryFor15Min(buffer)) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            await handleCompleteDrive();
            return;
          }
        }
      } catch (e) {
        console.log('Location/buffer error:', e.message);
      }
    }, 2000);

    activateKeepAwakeAsync();
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
    if (autoCompleteCheckRef.current) {
      clearInterval(autoCompleteCheckRef.current);
      autoCompleteCheckRef.current = null;
    }
    peakAccelerometer.current = { x: 0, y: 0, z: 0 };
    gravity.current = { x: 0, y: 0, z: 0 };
    deactivateKeepAwake();
    setTracking(false);
  };

  const stopTrackingSilent = () => {
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
  };

  const takeOverWithAccel = async () => {
    await pauseBackgroundRecording();
    startTracking();
  };

  const uploadBufferAndStop = async (trimmed) => {
    const result = await uploadDriveAndClear(trimmed);
    setScore(result?.score ?? null);
    setSpeedLimit(null);
  };

  const handleCompleteDrive = async () => {
    setLoading(true);
    stopTracking();
    setSpeedLimit(null);
    try {
      const buffer = await getBuffer();
      const trimmed = trimStationaryTail(buffer);
      await uploadBufferAndStop(trimmed);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Could not save drive');
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    setLoading(true);
    try {
      await clearBuffer();
      setScore(null);
      setSpeedLimit(null);
      startTracking();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Could not start');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSession = async () => {
    const fromBackground = await isBackgroundRecording();
    if (fromBackground) {
      setLoading(true);
      try {
        const result = await completeCurrentDriveAndStop();
        setScore(result?.score ?? null);
        setTracking(false);
      } catch (e) {
        Alert.alert('Error', 'Could not save drive');
      } finally {
        setLoading(false);
      }
      return;
    }
    await handleCompleteDrive();
  };

  useEffect(() => {
    if (!autoDetectLoaded) return;
    if (!autoDetect) {
      stopBackgroundUpdates();
      return;
    }
    startBackgroundWatching();
    return () => { stopBackgroundUpdates(); };
  }, [autoDetect, autoDetectLoaded]);

  useEffect(() => {
    if (!autoDetect || loading) return;
    const t = setInterval(async () => {
      const recording = await isBackgroundRecording();
      if (recording) {
        setTracking(true);
        if (!intervalRef.current) takeOverWithAccel();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [autoDetect, loading]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' && intervalRef.current) {
        stopTrackingSilent();
        resumeBackgroundRecording();
      }
      if (nextAppState === 'active') {
        isBackgroundRecording().then((recording) => {
          if (recording && !intervalRef.current) {
            setTracking(true);
            takeOverWithAccel();
          }
        });
      }
    });
    return () => sub.remove();
  }, []);

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
        {!tracking && (
          <TouchableOpacity
            style={[styles.autoToggle, autoDetect && styles.autoToggleOn]}
            onPress={async () => {
              const next = !autoDetect;
              setAutoDetect(next);
              await persistAutoDetect(next);
            }}
          >
            <Text style={styles.autoToggleText}>
              {autoDetect ? 'Auto on' : 'Auto off'}
            </Text>
          </TouchableOpacity>
        )}
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
              {tracking ? 'Recording… Save when you stop' : (autoDetect ? 'Auto: checking every few min when not driving' : 'Start a drive to see your score')}
            </Text>
          </>
        )}
      </View>

      {tracking && (
        <View style={styles.recordingRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>RECORDING (saved when you stop)</Text>
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
              {tracking ? 'STOP & SAVE' : 'START'}
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
  autoToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  autoToggleOn: {
    borderColor: ACCENT,
    backgroundColor: ACCENT + '22',
  },
  autoToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
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
