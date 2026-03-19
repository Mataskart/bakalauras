import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, StatusBar, AppState, Linking
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { getBuffer, clearBuffer } from '../driveBuffer';
import { uploadDriveAndClear } from '../uploadDrive';
import {
  startBackgroundWatching,
  stopBackgroundUpdates,
  isBackgroundRecording,
  pauseBackgroundRecording,
  resumeBackgroundRecording,
  requestBackgroundLocationPermission,
  hasBackgroundLocationPermission,
} from '../backgroundLocation';
import { getAutoDetect, setAutoDetect as persistAutoDetect } from '../storage/autoDetect';

const ACCENT = '#007ACC';
const BG = '#0e1117';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';
const DANGER = '#f85149';

const BATCH_SIZE = 50;

export default function HomeScreen() {
  const [score, setScore] = useState(null);
  const [speedLimit, setSpeedLimit] = useState(null);
  const [currentSpeed, setCurrentSpeed] = useState(null);
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
  const speedLimitExpiryRef = useRef(null);
  // Active session ID for streaming (manual drives and auto-drive takeovers)
  const sessionIdRef = useRef(null);
  // Events accumulated since last flush
  const pendingEventsRef = useRef([]);

  useEffect(() => {
    getAutoDetect()
      .then((v) => {
        setAutoDetect(!!v);
        setAutoDetectLoaded(true);
      })
      .catch(() => setAutoDetectLoaded(true));
  }, []);

  useEffect(() => {
    requestPermissions().catch(() => {});
    // Close any session that was left open if the app was killed mid-drive
    AsyncStorage.getItem('keliq_active_session_id').then((id) => {
      if (!id) return;
      client.patch(`/sessions/${id}/stop`, { endedAt: new Date().toISOString() }).catch(() => {});
      AsyncStorage.removeItem('keliq_active_session_id').catch(() => {});
    }).catch(() => {});
    return () => stopTracking();
  }, []);

  // Live GPS speed — 500 ms watch, no backend involved
  useEffect(() => {
    let subscription = null;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 500, distanceInterval: 0 },
      (loc) => {
        const speedMs = loc.coords.speed;
        setCurrentSpeed(speedMs != null && speedMs >= 0 ? Math.round(speedMs * 3.6) : null);
      }
    ).then((sub) => { subscription = sub; }).catch(() => {});
    return () => { subscription?.remove(); };
  }, []);

  const requestPermissions = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Location access is needed to track your drive.');
      }
    } catch (_) {}
  };

  // Build a single event object from location + peak accelerometer (does not touch storage).
  const buildEvent = (location, peak) => {
    const speedMs = location.coords.speed;
    const speedKmh = speedMs != null && speedMs >= 0 ? speedMs * 3.6 : undefined;
    const event = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accelerationX: peak.x * 9.8,
      accelerationY: peak.y * 9.8,
      accelerationZ: peak.z * 9.8,
      recordedAt: new Date().toISOString(),
    };
    if (speedKmh !== undefined) event.speed = speedKmh;
    return event;
  };

  // POST accumulated events to the active session; update live score + speed limit from response.
  const flushEvents = async () => {
    if (!sessionIdRef.current || pendingEventsRef.current.length === 0) return;
    const batch = [...pendingEventsRef.current];
    pendingEventsRef.current = [];
    try {
      const res = await client.post(`/sessions/${sessionIdRef.current}/events`, batch);
      if (res.data.currentScore != null) setScore(res.data.currentScore);
      if (res.data.speedLimitKmh != null) {
        setSpeedLimit(res.data.speedLimitKmh);
        if (speedLimitExpiryRef.current) clearTimeout(speedLimitExpiryRef.current);
        speedLimitExpiryRef.current = setTimeout(() => setSpeedLimit(null), 10000);
      }
    } catch (e) {
      console.log('Events flush error:', e.message);
    }
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
        peakAccelerometer.current = { x: 0, y: 0, z: 0 };

        const event = buildEvent(location, peak);
        pendingEventsRef.current.push(event);

        // Stream to API and get live score + speed limit back
        await flushEvents();
      } catch (e) {
        console.log('Location/stream error:', e.message);
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
    if (speedLimitExpiryRef.current) {
      clearTimeout(speedLimitExpiryRef.current);
      speedLimitExpiryRef.current = null;
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

  // Takes over an auto-detected background drive: uploads the accumulated buffer to create
  // a live session, then starts foreground streaming so score updates every 2 s.
  const takeOverAutoSession = async () => {
    await pauseBackgroundRecording();
    const buffer = await getBuffer();
    if (buffer.length > 0) {
      try {
        const startedAt = buffer[0].recordedAt;
        const startRes = await client.post('/sessions', { startedAt });
        sessionIdRef.current = startRes.data.id;
        AsyncStorage.setItem('keliq_active_session_id', String(startRes.data.id)).catch(() => {});
        for (let i = 0; i < buffer.length; i += BATCH_SIZE) {
          const batch = buffer.slice(i, i + BATCH_SIZE).map((e) => ({
            latitude: e.latitude,
            longitude: e.longitude,
            accelerationX: e.accelerationX ?? 0,
            accelerationY: e.accelerationY ?? 0,
            accelerationZ: e.accelerationZ ?? 0,
            recordedAt: e.recordedAt,
            ...(e.speed !== undefined && { speed: e.speed }),
          }));
          const res = await client.post(`/sessions/${sessionIdRef.current}/events`, batch);
          if (res.data.currentScore != null) setScore(res.data.currentScore);
        }
        await clearBuffer();
      } catch (e) {
        console.log('Auto session takeover error:', e.message);
        sessionIdRef.current = null;
        AsyncStorage.removeItem('keliq_active_session_id').catch(() => {});
      }
    }
    startTracking();
  };

  // Manual START: create a session immediately and begin streaming.
  const handleStartSession = async () => {
    setLoading(true);
    try {
      setScore(null);
      setSpeedLimit(null);
      const res = await client.post('/sessions', {});
      sessionIdRef.current = res.data.id;
      AsyncStorage.setItem('keliq_active_session_id', String(res.data.id)).catch(() => {});
      startTracking();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Could not start');
    } finally {
      setLoading(false);
    }
  };

  // Manual STOP for a foreground session (manual or taken-over auto drive).
  // Flushes remaining events then stops the session — no trimming.
  const handleCompleteDrive = async () => {
    setLoading(true);
    stopTracking();
    setSpeedLimit(null);
    try {
      if (sessionIdRef.current) {
        await flushEvents();
        const stopRes = await client.patch(`/sessions/${sessionIdRef.current}/stop`, {
          endedAt: new Date().toISOString(),
        });
        setScore(stopRes.data?.score ?? null);
        sessionIdRef.current = null;
        AsyncStorage.removeItem('keliq_active_session_id').catch(() => {});
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Could not save drive');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSession = async () => {
    const fromBackground = await isBackgroundRecording();

    if (fromBackground) {
      setLoading(true);
      try {
        // Stop background location updates and dismiss notification
        await stopBackgroundUpdates();

        if (sessionIdRef.current) {
          // App already took over: flush remaining events and close the session
          stopTracking();
          await flushEvents();
          const stopRes = await client.patch(`/sessions/${sessionIdRef.current}/stop`, {
            endedAt: new Date().toISOString(),
          });
          setScore(stopRes.data?.score ?? null);
          sessionIdRef.current = null;
          AsyncStorage.removeItem('keliq_active_session_id').catch(() => {});
          setSpeedLimit(null);
        } else {
          // User hit STOP before the app finished taking over: upload buffer as-is, no trim
          stopTracking();
          setSpeedLimit(null);
          const buffer = await getBuffer();
          const result = await uploadDriveAndClear(buffer);
          setScore(result?.score ?? null);
        }
        setTracking(false);

        // Resume background watching if auto-detect is still on
        if (autoDetect) {
          startBackgroundWatching().catch(() => {});
        }
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
      stopBackgroundUpdates().catch(() => {});
      return;
    }
    const tryStart = async () => {
      try {
        await startBackgroundWatching();
      } catch (_) {}
    };
    const t = setTimeout(() => {
      tryStart();
    }, 800);
    return () => {
      clearTimeout(t);
      stopBackgroundUpdates().catch(() => {});
    };
  }, [autoDetect, autoDetectLoaded]);

  useEffect(() => {
    if (!autoDetect || loading) return;
    const t = setInterval(async () => {
      try {
        const recording = await isBackgroundRecording();
        if (recording) {
          setTracking(true);
          if (!intervalRef.current) takeOverAutoSession();
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(t);
  }, [autoDetect, loading]);

  const autoDetectRef = useRef(autoDetect);
  autoDetectRef.current = autoDetect;
  useEffect(() => {
    try {
      const sub = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'background' && intervalRef.current) {
          // Flush pending events before pausing the interval
          flushEvents().catch(() => {}).finally(() => {
            stopTrackingSilent();
            resumeBackgroundRecording().catch(() => {});
          });
        }
        if (nextAppState === 'active') {
          if (autoDetectRef.current) {
            startBackgroundWatching().catch(() => {});
          }
          isBackgroundRecording().then((recording) => {
            if (recording && !intervalRef.current) {
              setTracking(true);
              takeOverAutoSession().catch(() => {});
            } else if (sessionIdRef.current && !intervalRef.current) {
              // Manual session was paused when app went to background — restart streaming
              startTracking();
            }
          }).catch(() => {});
        }
      });
      return () => sub.remove();
    } catch (_) {
      return () => {};
    }
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
              if (autoDetect) {
                setAutoDetect(false);
                await persistAutoDetect(false);
                stopBackgroundUpdates();
                return;
              }
              const alreadyGranted = await hasBackgroundLocationPermission();
              if (alreadyGranted) {
                setAutoDetect(true);
                await persistAutoDetect(true);
                startBackgroundWatching().catch(() => {});
                return;
              }
              Alert.alert(
                'Background location',
                'Auto mode checks your location every few minutes to detect when you start driving, then records the drive. This requires "Allow all the time" (background) location access.\n\nYou can change this later in system settings.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Continue',
                    onPress: async () => {
                      const granted = await requestBackgroundLocationPermission();
                      if (granted) {
                        setAutoDetect(true);
                        await persistAutoDetect(true);
                        startBackgroundWatching().catch(() => {});
                        return;
                      }
                      await Linking.openSettings();
                      Alert.alert(
                        'Set location to "Allow all the time"',
                        'In keliq\'s settings, open Permissions and set Location to "Allow all the time". Then return here and tap Auto on again.',
                        [{ text: 'OK' }]
                      );
                    },
                  },
                ]
              );
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

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>SPEED</Text>
          <Text style={styles.statValue}>
            {currentSpeed != null ? `${currentSpeed}` : '—'}
          </Text>
          <Text style={styles.statUnit}>km/h</Text>
        </View>
        {tracking && (
          <View style={[styles.statBox, styles.statBoxRight]}>
            <Text style={styles.statLabel}>LIMIT</Text>
            <Text style={[
              styles.statValue,
              currentSpeed != null && speedLimit != null && currentSpeed > speedLimit + 10
                ? { color: DANGER }
                : null,
            ]}>
              {speedLimit != null ? `${Math.round(speedLimit)}` : '—'}
            </Text>
            <Text style={styles.statUnit}>km/h</Text>
          </View>
        )}
      </View>

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
            {!tracking && (
              <Text style={styles.driveButtonSub}>
                DRIVE
              </Text>
            )}
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 24,
  },
  statBox: {
    alignItems: 'center',
    minWidth: 80,
  },
  statBoxRight: {
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    paddingLeft: 24,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 2,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -1,
  },
  statUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED,
    marginTop: 1,
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
    textAlign: 'center',
  },
  driveButtonSub: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    letterSpacing: 3,
    marginTop: 2,
    textAlign: 'center',
  },
});
