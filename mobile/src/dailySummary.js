/**
 * Daily summary at 21:00 local: fetch today's average score and show one notification.
 * Uses BackgroundTask (WorkManager); when run around 21:00 we send the summary.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import client from './api/client';
import { showDailySummaryNotification } from './notifications';

const DAILY_SUMMARY_TASK = 'keliq-daily-summary';
const LAST_SENT_KEY = 'keliq_daily_summary_last_date';

function todayLocalDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

TaskManager.defineTask(DAILY_SUMMARY_TASK, async () => {
  const now = new Date();
  const hour = now.getHours();
  const today = todayLocalDateStr();
  try {
    const lastSent = await AsyncStorage.getItem(LAST_SENT_KEY);
    if (lastSent === today) return BackgroundTask.BackgroundTaskResult.Success;

    if (hour < 20 || hour > 22) return BackgroundTask.BackgroundTaskResult.Success;

    const { data } = await client.get('/me/today-stats', { params: { date: today } });
    await showDailySummaryNotification({
      averageScore: data.averageScore ?? null,
      driveCount: data.driveCount ?? 0,
    });
    await AsyncStorage.setItem(LAST_SENT_KEY, today);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerDailySummaryTask() {
  try {
    await BackgroundTask.registerTaskAsync(DAILY_SUMMARY_TASK, {
      minimumInterval: 60 * 15,
    });
  } catch (e) {
    console.warn('BackgroundTask register failed:', e.message);
  }
}

export async function unregisterDailySummaryTask() {
  try {
    await BackgroundTask.unregisterTaskAsync(DAILY_SUMMARY_TASK);
  } catch (_) {}
}
