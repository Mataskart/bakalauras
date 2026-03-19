/**
 * Config plugin: sets android:stopWithTask="false" on the expo-location background
 * service so it survives the user swiping the app away from recents.
 *
 * Without this, Android treats swipe-from-recents as an explicit stop signal and
 * kills all services bound to the app process — regardless of battery optimization
 * settings (Unrestricted, etc.).
 *
 * Apply: listed in app.json plugins array.
 * Activate: rebuild with `expo run:android` or EAS build.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const LOCATION_SERVICE = 'expo.modules.location.LocationTaskService';

module.exports = function withLocationStopWithTask(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0];

    if (!Array.isArray(application.service)) {
      application.service = [];
    }

    const existing = application.service.find(
      (s) => s.$?.['android:name'] === LOCATION_SERVICE
    );

    if (existing) {
      // Patch the entry added by expo-location's own plugin
      existing.$['android:stopWithTask'] = 'false';
    } else {
      // expo-location plugin hasn't run yet or named it differently — add a full entry
      application.service.push({
        $: {
          'android:name': LOCATION_SERVICE,
          'android:stopWithTask': 'false',
          'android:foregroundServiceType': 'location',
          'android:exported': 'false',
        },
      });
    }

    return config;
  });
};
