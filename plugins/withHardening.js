/**
 * Native hardening that app.json cannot express.
 *
 * Android: release builds lose the INTERNET permission, so the OS itself prevents
 * network access. Debug builds keep it because Metro needs it.
 * Android: Auto Backup and device-transfer rules exclude the keyring.
 * iOS: enables the Apple-silicon Mac destination ("Designed for iPad").
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const RELEASE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove" />
</manifest>
`;

function withReleaseOfflineManifest(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const directory = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/release');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'AndroidManifest.xml'), RELEASE_MANIFEST);
      return modConfig;
    },
  ]);
}

function withMacDestination(config) {
  return withXcodeProject(config, (modConfig) => {
    const buildConfigurations = modConfig.modResults.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(buildConfigurations)) {
      if (entry && entry.buildSettings && entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER) {
        entry.buildSettings.SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = 'YES';
      }
    }
    return modConfig;
  });
}

module.exports = (config) => withMacDestination(withReleaseOfflineManifest(config));
