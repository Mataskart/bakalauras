import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DAILY_CHANNEL_ID = 'keliq-daily';

/**
 * Request notification permission. Call after login so the prompt is shown.
 * Returns true if granted.
 */
export async function requestNotificationPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === 'granted';
}

/**
 * Set up channels and ensure permission. Call once after login.
 */
export async function setupDailyNotification() {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.setNotificationChannelAsync(DAILY_CHANNEL_ID, {
    name: 'Daily summary',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Schedule only the daily 21:00 summary. No other daily reminder.
 * The actual body (today's average score) is set when the 21:00 job runs (see dailySummary.js).
 */
export async function scheduleDailySummaryAt21() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  // We don't schedule a static notification here; the 21:00 summary is sent by the background task
  // after fetching today's stats. So nothing to schedule for daily summary.
}

/**
 * Cancel all scheduled notifications (e.g. if user disables).
 */
export async function cancelDailyReminder() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Show the daily summary notification (called by background task at 21:00 after fetching stats).
 * @param {{ averageScore: number | null, driveCount: number }} stats
 */
export async function showDailySummaryNotification(stats) {
  const { averageScore, driveCount } = stats;
  let body;
  if (driveCount === 0) {
    body = "No drives today.";
  } else if (averageScore != null) {
    body = `Today's average driving score: ${Math.round(averageScore)} (${driveCount} drive${driveCount !== 1 ? 's' : ''})`;
  } else {
    body = `${driveCount} drive${driveCount !== 1 ? 's' : ''} today.`;
  }
  await Notifications.setNotificationChannelAsync(DAILY_CHANNEL_ID, {
    name: 'Daily summary',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'keliq',
      body,
      data: {},
      channelId: DAILY_CHANNEL_ID,
    },
    trigger: null,
  });
}
