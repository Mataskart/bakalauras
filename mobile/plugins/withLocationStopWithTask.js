/**
 * Config plugin: sets up all manifest entries required for persistent background services.
 *
 * 1. expo-location / expo-task-manager services — adds stopWithTask="false" so the OS
 *    does not kill them when the user swipes the app from recents.
 *
 * 2. react-native-background-actions — declares the native START_STICKY service and the
 *    FOREGROUND_SERVICE + FOREGROUND_SERVICE_LOCATION permissions it needs. Without
 *    these the native module throws a hard crash when BackgroundService.start() is called.
 *
 * Rebuild required after changes: npx expo run:android
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const RN_BG_ACTIONS_SERVICE = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

const EXPO_SERVICES_STOP_WITH_TASK = [
  'expo.modules.location.LocationTaskService',
  'expo.modules.taskManager.TaskManagerService',
];

function ensureService(services, attrs) {
  const existing = services.find((s) => s.$?.['android:name'] === attrs['android:name']);
  if (existing) {
    Object.assign(existing.$, attrs);
  } else {
    services.push({ $: attrs });
  }
}

function ensurePermission(permissions, name) {
  if (!permissions.find((p) => p.$?.['android:name'] === name)) {
    permissions.push({ $: { 'android:name': name } });
  }
}

module.exports = function withBackgroundServices(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];

    if (!Array.isArray(application.service)) application.service = [];
    if (!Array.isArray(manifest['uses-permission'])) manifest['uses-permission'] = [];

    // ── 1. Patch expo services to survive swipe-from-recents ────────────────
    for (const name of EXPO_SERVICES_STOP_WITH_TASK) {
      const existing = application.service.find((s) => s.$?.['android:name'] === name);
      if (existing) {
        existing.$['android:stopWithTask'] = 'false';
      }
      // If not present yet expo-location's own plugin will add it later;
      // we patch in a second pass after all plugins run (plugin order is preserved).
    }

    // Ensure LocationTaskService exists with stopWithTask (fallback if expo-location
    // plugin runs after ours and overwrites — we add it now; expo-location will merge).
    ensureService(application.service, {
      'android:name': 'expo.modules.location.LocationTaskService',
      'android:stopWithTask': 'false',
      'android:foregroundServiceType': 'location',
      'android:exported': 'false',
    });

    // ── 2. react-native-background-actions service + permissions ────────────
    ensureService(application.service, {
      'android:name': RN_BG_ACTIONS_SERVICE,
      'android:foregroundServiceType': 'location',
      'android:exported': 'false',
      'android:stopWithTask': 'false',
    });

    ensurePermission(manifest['uses-permission'], 'android.permission.FOREGROUND_SERVICE');
    ensurePermission(manifest['uses-permission'], 'android.permission.FOREGROUND_SERVICE_LOCATION');

    return config;
  });
};
