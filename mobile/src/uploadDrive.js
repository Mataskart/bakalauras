/**
 * Standalone drive upload (no React). Used after trim when drive completes.
 * Can be called from background task or HomeScreen.
 */

import client from './api/client';
import { clearBuffer } from './driveBuffer';

const BATCH_SIZE = 50;

export async function uploadDriveAndClear(trimmed) {
  if (trimmed.length === 0) {
    await clearBuffer();
    return { sessionId: null, score: null };
  }
  const startedAt = trimmed[0].recordedAt;
  const endedAt = trimmed[trimmed.length - 1].recordedAt;

  const sessionRes = await client.post('/sessions', { startedAt });
  const sessionId = sessionRes.data.id;

  for (let i = 0; i < trimmed.length; i += BATCH_SIZE) {
    const batch = trimmed.slice(i, i + BATCH_SIZE);
    const payload = batch.map((e) => ({
      latitude: e.latitude,
      longitude: e.longitude,
      accelerationX: e.accelerationX ?? 0,
      accelerationY: e.accelerationY ?? 0,
      accelerationZ: e.accelerationZ ?? 0,
      recordedAt: e.recordedAt,
      ...(e.speed !== undefined && { speed: e.speed }),
    }));
    await client.post(`/sessions/${sessionId}/events`, payload);
  }

  const stopRes = await client.patch(`/sessions/${sessionId}/stop`, { endedAt });
  await clearBuffer();
  return { sessionId: sessionRes.data.id, score: stopRes.data?.score ?? null };
}
