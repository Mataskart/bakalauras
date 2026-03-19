/**
 * Background location: watch for drive start, then record continuously.
 *
 * Detection layer (watch mode):
 *   react-native-background-actions — runs a native START_STICKY Android foreground
 *   service that keeps its own process alive independently of the app. Survives swipe-
 *   from-recents on any Android device. Polls GPS every 20 s while stationary/slow,
 *   immediately detects driving when speed exceeds the threshold.
 *
 * Recording layer (record mode):
 *   expo-location startLocationUpdatesAsync — once a drive is detected the native
 *   background action stops and the high-frequency location task takes over buffering.
 *
 * WorkManager (expo-background-task) is kept as a reboot-recovery fallback: if the
 * device restarts while in RECORD mode, the periodic task will re-start the location
 * service on the next wake-up.
 *
 * All TaskManager.defineTask calls must happen at module load time (imported from index.js).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundService from 'react-native-background-actions';
import * as BackgroundTask from 'expo-background-task';
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

const LOCATION_TASK_NAME   = 'keliq-background-location';
const FETCH_TASK_NAME      = 'keliq-watch-fetch';
const STORAGE_MODE_KEY     = 'keliq_background_mode';
const MODE_WATCH           = 'watch';
const MODE_RECORD          = 'record';
const DRIVING_START_KMH    = 25;
const WATCH_POLL_MS        = 20_000;   // how often the persistent service polls GPS
const RECORD_INTERVAL_MS   = 1500;
const RECORDING_CHANNEL_ID = 'keliq-recording';

// ─── AsyncStorage mode helpers ────────────────────────────────────────────────

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

// ─── Notifications ────────────────────────────────────────────────────────────

let recordingNotificationId = null;

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

// ─── Location helpers ─────────────────────────────────────────────────────────

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

// ─── Transition WATCH → RECORD ────────────────────────────────────────────────

async function startRecording() {
  await setMode(MODE_RECORD);
  await clearBuffer();
  await showRecordingNotification();
  try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (_) {}
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, recordOpts);
  } catch (e) {
    console.warn('Start record updates failed:', e.message);
    await appendLog(`RECORD start failed: ${e.message}`);
    await setMode(MODE_WATCH);
    await dismissRecordingNotification();
  }
}

// ─── Layer 1 (detection): react-native-background-actions ────────────────────
// Runs inside a native START_STICKY service — survives app kill on Android.
// Polls GPS every WATCH_POLL_MS; when speed exceeds threshold it starts recording
// and stops itself (the expo-location task takes over from there).

const watchServiceOptions = {
  taskName: 'KeliqWatch',
  taskTitle: 'keliq',
  taskDesc: 'Auto-detect: watching for drive start',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  color: '#30363d',
  // linkingURI intentionally omitted — an unregistered scheme crashes on notification tap
  parameters: {},
};

async function watchLoop() {
  await appendLog('watchLoop: native background service started');
  while (BackgroundService.isRunning()) {
    try {
      const mode = await getMode();
      if (mode === MODE_RECORD) {
        // A drive was started externally (manual or WorkManager) — stop the watch loop.
        await appendLog('watchLoop: mode switched to RECORD externally, stopping loop');
        break;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);

      if (location) {
        const speedMs = location.coords?.speed;
        const speedKmh = speedMs != null && speedMs >= 0 ? speedMs * 3.6 : 0;

        if (speedKmh >= DRIVING_START_KMH) {
          await logWatchPing({ speedKmh, action: 'DRIVE DETECTED — switching to RECORD' });
          await startRecording();
          break; // hand off to expo-location recording task
        } else {
          await logWatchPing({ speedKmh, action: `below ${DRIVING_START_KMH} km/h, watching` });
        }
      }
    } catch (e) {
      await appendLog(`watchLoop error: ${e.message}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, WATCH_POLL_MS));
  }
  await appendLog('watchLoop: exiting');
}

// ─── Layer 2 (recording): expo-location task ─────────────────────────────────

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    await appendLog(`LOCATION TASK ERROR: ${error.message}`);
    return;
  }
  if (!data?.locations?.length) return;

  const mode = await getMode();
  if (mode !== MODE_RECORD) return;

  for (const loc of data.locations) {
    await appendToBuffer([locationToEvent(loc)]);
  }

  const buffer = await getBuffer();
  if (hasBeenStationaryFor15Min(buffer)) {
    await appendLog(`RECORD: stationary 5 min — auto-completing (${buffer.length} events)`);
    try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (_) {}
    const trimmed = trimStationaryTail(buffer);
    try {
      await uploadDriveAndClear(trimmed);
    } catch (e) {
      await appendLog(`Upload error: ${e.message}`);
    }
    await setMode(MODE_WATCH);
    await dismissRecordingNotification();
    // Restart the watch service so detection resumes after drive ends
    startBackgroundWatching().catch(() => {});
  }
});

// ─── Layer 3 (reboot recovery): expo-background-task / WorkManager ───────────
// Fires periodically even after reboot; re-starts the watch service if it isn't running.

TaskManager.defineTask(FETCH_TASK_NAME, async () => {
  try {
    const mode = await getMode();
    if (mode === MODE_RECORD) {
      // Ensure the recording location task is running
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      if (!isRunning) {
        await appendLog('WorkManager: RECORD mode but location task gone — restarting');
        await startRecording();
      }
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // WATCH mode: ensure the background service is running
    if (!BackgroundService.isRunning()) {
      await appendLog('WorkManager: watch service not running — restarting');
      BackgroundService.start(watchLoop, watchServiceOptions).catch(() => {});
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    await appendLog(`WorkManager task error: ${e.message}`);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// ─── Permission helpers ───────────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startBackgroundWatching() {
  console.log('[BG] startBackgroundWatching: entry');
  try {
    console.log('[BG] checking foreground permission...');
    const fg = await Location.getForegroundPermissionsAsync();
    console.log('[BG] foreground permission:', fg.status);
    if (fg.status !== 'granted') { console.log('[BG] no fg perm, aborting'); return false; }

    console.log('[BG] checking background permission...');
    const bg = await Location.getBackgroundPermissionsAsync();
    console.log('[BG] background permission:', bg.status);
    if (bg.status !== 'granted') { console.log('[BG] no bg perm, aborting'); return false; }

    console.log('[BG] setting mode to WATCH...');
    await setMode(MODE_WATCH);
    console.log('[BG] mode set');

    console.log('[BG] BackgroundService.isRunning():', BackgroundService.isRunning());
    if (!BackgroundService.isRunning()) {
      console.log('[BG] calling BackgroundService.start()...');
      await BackgroundService.start(watchLoop, watchServiceOptions);
      console.log('[BG] BackgroundService.start() returned — service is running');
    } else {
      console.log('[BG] BackgroundService already running, skipping start');
    }

    console.log('[BG] registering WorkManager fallback...');
    try {
      await BackgroundTask.registerTaskAsync(FETCH_TASK_NAME, { minimumInterval: 60 * 15 });
      console.log('[BG] WorkManager task registered');
    } catch (e) {
      console.log('[BG] WorkManager register (already registered or error):', e.message);
    }

    await appendLog('startBackgroundWatching: OK');
    console.log('[BG] startBackgroundWatching: done');
    return true;
  } catch (e) {
    console.log('[BG] startBackgroundWatching THREW:', e?.message, e);
    await appendLog(`startBackgroundWatching failed: ${e?.message}`);
    throw e; // re-throw so the caller can surface it
  }
}

export async function stopBackgroundUpdates() {
  if (BackgroundService.isRunning()) {
    await BackgroundService.stop().catch(() => {});
  }
  try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (_) {}
  try { await BackgroundTask.unregisterTaskAsync(FETCH_TASK_NAME); } catch (_) {}
  await setMode(MODE_WATCH);
  await dismissRecordingNotification();
  await appendLog('stopBackgroundUpdates: all layers stopped');
}

export async function isBackgroundRecording() {
  return (await getMode()) === MODE_RECORD;
}

export async function completeCurrentDriveAndStop() {
  try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (_) {}
  const buffer = await getBuffer();
  await appendLog(`completeCurrentDriveAndStop: ${buffer.length} events (no trim)`);
  let result = { score: null };
  try {
    result = await uploadDriveAndClear(buffer);
  } catch (e) {
    await appendLog(`Upload error: ${e.message}`);
  }
  await setMode(MODE_WATCH);
  await dismissRecordingNotification();
  // Restart watch
  await startBackgroundWatching().catch(() => {});
  return result;
}

export async function pauseBackgroundRecording() {
  try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (_) {}
}

export async function resumeBackgroundRecording() {
  if ((await getMode()) !== MODE_RECORD) return;
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, recordOpts);
  } catch (e) {
    await appendLog(`resumeBackgroundRecording failed: ${e.message}`);
  }
}
