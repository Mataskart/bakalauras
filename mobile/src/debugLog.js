/**
 * Rolling debug log stored in AsyncStorage (device-side).
 * Each entry: "ISO8601 | message"
 * Also POSTs to the server so you can tail /var/log on the VPS.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from './api/client';

const LOG_KEY = 'keliq_watch_log';
const MAX_ENTRIES = 300;
const SERVER_PING_URL = '/debug/gps-ping';

export async function appendLog(message) {
  const entry = `${new Date().toISOString()} | ${message}`;
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    entries.push(entry);
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch (e) {
    console.warn('[debugLog] write error:', e.message);
  }
}

/** Read all log lines as a plain string, newest last. */
export async function getLog() {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw).join('\n') : '(empty)';
  } catch {
    return '(empty)';
  }
}

export async function clearLog() {
  await AsyncStorage.removeItem(LOG_KEY).catch(() => {});
}

/**
 * Log a watch-mode check and fire-and-forget POST to the VPS so it appears
 * in the Symfony prod/dev log (tail var/log/prod.log on the server).
 */
export async function logWatchPing({ speedKmh, action }) {
  const msg = `WATCH | speed=${speedKmh != null ? speedKmh.toFixed(1) : '?'} km/h | ${action}`;
  await appendLog(msg);
  // Best-effort server ping — ignore failures
  client.post(SERVER_PING_URL, {
    speedKmh,
    action,
    timestamp: new Date().toISOString(),
  }).catch(() => {});
}
