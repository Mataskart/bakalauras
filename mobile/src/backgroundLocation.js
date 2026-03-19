/**
 * Background location: low-frequency "watch" until drive detected, then "record" with frequent updates.
 * Task must be defined at load time (imported from index.js).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import {
  getBuffer,
  appendToBuffer,
  clearBuffer,
  trimStationaryTail,
  hasBeenStationaryFor15Min,
} from './driveBuffer';
import { uploadDriveAndClear } from './uploadDrive';
import { logWatchPing, appendLog } from './debugLog';

const LOCATION_TASK_NAME = 'keliq-background-location';
const STORAGE_MODE_KEY = 'keliq_background_mode';
const MODE_WATCH = 'watch';
const MODE_RECORD = 'record';
const DRIVING_START_KMH = 25;
// Watch mode: primary trigger is 50 m of movement (~6 s at 30 km/h → near-immediate detection).
// timeInterval is a fallback so the task also wakes up every 2 min while stationary.
const WATCH_INTERVAL_MS = 2 * 60 * 1000;
const WATCH_DISTANCE_M = 50;
const RECORD_INTERVAL_MS = 1500;            // 1.5 s when recording
const RECORDING_CHANNEL_ID = 'keliq-recording';

let recordingNotificationId = null;

async function getMode() {
  try {
    return await AsyncStorage.getItem(STORAGE_MODE_KEY) || MODE_WATCH;
  } catch {
    return MODE_WATCH;
  }
}

async function setMode(mode) {
  await AsyncStorage.setItem(STORAGE_MODE_KEY, mode);
}

async function showRecordingNotification() {
  try {
    await Notifications.setNotificationChannelAsync(RECORDING_CHANNEL_ID, {
      name: 'Drive recording',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'keliq',
        body: 'Drive recording started',
        data: {},
        channelId: RECORDING_CHANNEL_ID,
      },
      trigger: null,
    });
    recordingNotificationId = id;
  } catch (e) {
    console.warn('Notification error:', e.message);
  }
}

async function dismissRecordingNotification() {
  if (recordingNotificationId != null) {
    try {
      await Notifications.dismissNotificationAsync(recordingNotificationId);
    } catch (_) {}
    recordingNotificationId = null;
  }
}

function locationToEvent(location) {
  const speedMs = location.coords?.speed;
  const speedKmh = (speedMs != null && speedMs >= 0) ? speedMs * 3.6 : undefined;
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accelerationX: 0,
    accelerationY: 0,
    accelerationZ: 0,
    recordedAt: new Date().toISOString(),
    ...(speedKmh !== undefined && { speed: speedKmh }),
  };
}

const watchOpts = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: WATCH_INTERVAL_MS,
  distanceInterval: WATCH_DISTANCE_M,
};

const recordOpts = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: RECORD_INTERVAL_MS,
  distanceInterval: 0,
  foregroundService: {
    notificationTitle: 'keliq',
    notificationBody: 'Recording drive',
    notificationColor: '#007ACC',
  },
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('Background location task error:', error.message);
    await appendLog(`TASK ERROR: ${error.message}`);
    return;
  }
  if (!data?.locations?.length) return;

  const mode = await getMode();
  const locations = data.locations;

  if (mode === MODE_WATCH) {
    const last = locations[locations.length - 1];
    const speedMs = last.coords?.speed;
    const speedKmh = (speedMs != null && speedMs >= 0) ? speedMs * 3.6 : 0;

    if (speedKmh >= DRIVING_START_KMH) {
      await logWatchPing({ speedKmh, action: `DRIVE DETECTED — switching to RECORD` });
      await setMode(MODE_RECORD);
      await clearBuffer();
      await showRecordingNotification();
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch (_) {}
      try {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, recordOpts);
      } catch (e) {
        console.warn('Start record updates failed:', e.message);
        await appendLog(`RECORD start failed: ${e.message}`);
        await setMode(MODE_WATCH);
        await dismissRecordingNotification();
      }
    } else {
      // Below threshold — log and stay in watch mode
      await logWatchPing({ speedKmh, action: `below threshold (${DRIVING_START_KMH} km/h), staying in watch` });
    }
    return;
  }

  if (mode === MODE_RECORD) {
    for (const loc of locations) {
      const event = locationToEvent(loc);
      await appendToBuffer([event]);
    }
    const buffer = await getBuffer();
    if (hasBeenStationaryFor15Min(buffer)) {
      await appendLog(`RECORD: stationary 15 min — auto-completing drive (${buffer.length} events)`);
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch (_) {}
      const trimmed = trimStationaryTail(buffer);
      try {
        await uploadDriveAndClear(trimmed);
      } catch (e) {
        console.warn('Upload error:', e.message);
        await appendLog(`Upload error: ${e.message}`);
      }
      await setMode(MODE_WATCH);
      await dismissRecordingNotification();
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, watchOpts);
    }
  }
});

/**
 * Check if we already have background (or sufficient) location permission without requesting.
 */
export async function hasBackgroundLocationPermission() {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch (_) {
    return false;
  }
}

/**
 * Request background location permission. Call when user enables Auto.
 * On Android 11+ this may open system settings; explain to the user first.
 * @returns {Promise<boolean>} true if background (or foreground-only) allowed so we can proceed
 */
export async function requestBackgroundLocationPermission() {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;
  }
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status === 'granted') return true;
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === 'granted';
}

export async function startBackgroundWatching() {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;

    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (_) {}
    await setMode(MODE_WATCH);
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, watchOpts);
    await appendLog('startBackgroundWatching: watch started');
    return true;
  } catch (e) {
    await appendLog(`startBackgroundWatching failed: ${e.message}`);
    return false;
  }
}

export async function stopBackgroundUpdates() {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (_) {}
  await setMode(MODE_WATCH);
  await dismissRecordingNotification();
}

export async function isBackgroundRecording() {
  const mode = await getMode();
  return mode === MODE_RECORD;
}

/** Stop recording, upload buffer without trimming, switch back to watch.
 *  Called from UI when user taps Stop on an auto-detected drive. Returns { score } if upload succeeded. */
export async function completeCurrentDriveAndStop() {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (_) {}
  const buffer = await getBuffer();
  await appendLog(`completeCurrentDriveAndStop: uploading ${buffer.length} events (no trim)`);
  let result = { score: null };
  try {
    result = await uploadDriveAndClear(buffer);
  } catch (e) {
    console.warn('Upload error:', e.message);
    await appendLog(`Upload error: ${e.message}`);
  }
  await setMode(MODE_WATCH);
  await dismissRecordingNotification();
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, watchOpts);
  return result;
}

/** Pause background location updates so the app can take over (e.g. with accelerometer). */
export async function pauseBackgroundRecording() {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (_) {}
}

/** Resume background location updates (e.g. when app goes to background). */
export async function resumeBackgroundRecording() {
  const mode = await getMode();
  if (mode !== MODE_RECORD) return;
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, recordOpts);
  } catch (e) {
    console.warn('Resume record updates failed:', e.message);
    await appendLog(`resumeBackgroundRecording failed: ${e.message}`);
  }
}
