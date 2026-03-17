/**
 * Local drive buffer: store driving events on device until drive is complete.
 * Events are only sent to the API when the drive is finished (manual stop or auto-complete).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BUFFER_KEY = 'keliq_drive_buffer';
const STATIONARY_SPEED_KMH = 5;
const STATIONARY_END_MINUTES = 15;

/**
 * @typedef {Object} BufferedEvent
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} accelerationX
 * @property {number} accelerationY
 * @property {number} accelerationZ
 * @property {number} [speed]
 * @property {string} recordedAt - ISO8601
 */

/**
 * Load current buffer from storage.
 * @returns {Promise<BufferedEvent[]>}
 */
export async function getBuffer() {
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Append events to the buffer and persist.
 * @param {BufferedEvent[]} events
 */
export async function appendToBuffer(events) {
  const current = await getBuffer();
  const next = [...current, ...events];
  await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(next));
}

/**
 * Clear the buffer (after successful upload or on cancel).
 */
export async function clearBuffer() {
  await AsyncStorage.removeItem(BUFFER_KEY);
}

/**
 * Trim the last N minutes of the drive from scoring (stationary period at end).
 * Returns events with recordedAt <= (lastEventTime - 15 minutes).
 * @param {BufferedEvent[]} buffer
 * @returns {BufferedEvent[]}
 */
export function trimStationaryTail(buffer) {
  if (buffer.length === 0) return [];
  const last = buffer[buffer.length - 1];
  const lastTime = new Date(last.recordedAt).getTime();
  const cutOff = lastTime - STATIONARY_END_MINUTES * 60 * 1000;
  return buffer.filter((e) => new Date(e.recordedAt).getTime() <= cutOff);
}

/**
 * Check if we have been stationary (speed < STATIONARY_SPEED_KMH) for at least 15 minutes.
 * @param {BufferedEvent[]} buffer
 * @returns {boolean}
 */
export function hasBeenStationaryFor15Min(buffer) {
  if (buffer.length === 0) return false;
  const now = new Date(buffer[buffer.length - 1].recordedAt).getTime();
  const cutoff = now - STATIONARY_END_MINUTES * 60 * 1000;
  const inWindow = buffer.filter((e) => new Date(e.recordedAt).getTime() >= cutoff);
  const allStationary = inWindow.every((e) => {
    const s = e.speed;
    return s == null || s < STATIONARY_SPEED_KMH;
  });
  const times = inWindow.map((e) => new Date(e.recordedAt).getTime());
  const spanMs = times.length ? Math.max(...times) - Math.min(...times) : 0;
  return allStationary && spanMs >= STATIONARY_END_MINUTES * 60 * 1000;
}

export { STATIONARY_SPEED_KMH, STATIONARY_END_MINUTES };
