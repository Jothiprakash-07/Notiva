/* global __dirname */
const { withAndroidManifest, withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function withNativeAlarm(config) {
  config = withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    const permissions = ['SCHEDULE_EXACT_ALARM', 'USE_FULL_SCREEN_INTENT', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'WAKE_LOCK', 'VIBRATE', 'RECEIVE_BOOT_COMPLETED', 'POST_NOTIFICATIONS'];
    manifest['uses-permission'] ||= [];
    for (const permission of permissions) {
      const name = `android.permission.${permission}`;
      if (!manifest['uses-permission'].some(p => p.$['android:name'] === name)) manifest['uses-permission'].push({ $: { 'android:name': name } });
    }
    const app = manifest.application[0];
    const add = (kind, name, attributes, children = {}) => {
      app[kind] ||= [];
      app[kind] = app[kind].filter(n => n.$['android:name'] !== name);
      app[kind].push({ $: { 'android:name': name, 'android:exported': 'false', ...attributes }, ...children });
    };
    add('activity', 'com.notiva.alarm.AlarmActivity', { 'android:theme': '@android:style/Theme.Material.NoActionBar', 'android:excludeFromRecents': 'true', 'android:launchMode': 'singleTask', 'android:showWhenLocked': 'true', 'android:turnScreenOn': 'true' });
    add('service', 'com.notiva.alarm.AlarmService', { 'android:foregroundServiceType': 'mediaPlayback', 'android:stopWithTask': 'false' });
    add('receiver', 'com.notiva.alarm.AlarmReceiver', {});
    add('receiver', 'com.notiva.alarm.AlarmRestoreReceiver', {}, {
      'intent-filter': [{ action: ['android.intent.action.BOOT_COMPLETED', 'android.intent.action.MY_PACKAGE_REPLACED', 'android.intent.action.TIME_SET', 'android.intent.action.TIMEZONE_CHANGED', 'android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED'].map(name => ({ $: { 'android:name': name } })) }],
    });
    return config;
  });
  config = withMainApplication(config, config => {
    const marker = 'PackageList(this).packages.apply {';
    if (!config.modResults.contents.includes('add(com.notiva.alarm.AlarmPackage())')) {
      if (!config.modResults.contents.includes(marker)) throw new Error('Native alarm requires Kotlin MainApplication package registration.');
      config.modResults.contents = config.modResults.contents.replace(marker, `${marker}\n              add(com.notiva.alarm.AlarmPackage())`);
    }
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const target = path.join(config.modRequest.platformProjectRoot, 'app/src/main/java/com/notiva/alarm');
    fs.mkdirSync(target, { recursive: true });
    for (const file of fs.readdirSync(path.join(__dirname, 'native-alarm'))) {
      if (file.endsWith('.kt')) fs.copyFileSync(path.join(__dirname, 'native-alarm', file), path.join(target, file));
    }
    const rawSource = path.join(__dirname, 'native-alarm/res/raw');
    const rawTarget = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/raw');
    fs.mkdirSync(rawTarget, { recursive: true });
    for (const file of fs.readdirSync(rawSource)) {
      if (!/^[a-z][a-z0-9_]*\.mp3$/.test(file)) throw new Error(`Invalid alarm resource name: ${file}`);
      fs.copyFileSync(path.join(rawSource, file), path.join(rawTarget, file));
    }
    return config;
  }]);
};
