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
 * Request permission and set up the daily reminder channel (Android).
 * Call once after login or on app load when user is logged in.
 */
export async function setupDailyNotification() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    status = requested;
  }
  if (status !== 'granted') return;

  await Notifications.setNotificationChannelAsync(DAILY_CHANNEL_ID, {
    name: 'Daily reminder',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Schedule a daily local notification (e.g. 8:00 AM).
 * @param {Object} opts
 * @param {number} [opts.hour=8]
 * @param {number} [opts.minute=0]
 */
export async function scheduleDailyReminder({ hour = 8, minute = 0 } = {}) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'keliq',
      body: 'Drive safe today — open keliq to track your drive.',
      data: {},
      channelId: DAILY_CHANNEL_ID,
    },
    trigger: {
      hour,
      minute,
      repeats: true,
      channelId: DAILY_CHANNEL_ID,
    },
  });
}

/**
 * Cancel the daily reminder.
 */
export async function cancelDailyReminder() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
