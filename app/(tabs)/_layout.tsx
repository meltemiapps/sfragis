import { NativeTabs } from 'expo-router/native-tabs';

import { colors } from '../../utils/theme';

/**
 * System tab bar. iOS 26 and later draws it as Liquid Glass; earlier iOS and Android get
 * their standard bar in the app palette. testID maps to the accessibility identifier on iOS,
 * which the Maestro flows match.
 */
export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={colors.aegean}
      iconColor={{ default: colors.mist, selected: colors.aegean }}
      labelStyle={{ default: { color: colors.mist }, selected: { color: colors.aegean } }}
      backgroundColor={colors.deep}
    >
      <NativeTabs.Trigger name="index" testID="tab-keyring">
        <NativeTabs.Trigger.Icon sf="key" md="key" />
        <NativeTabs.Trigger.Label>Keyring</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="studio" testID="tab-encrypt">
        <NativeTabs.Trigger.Icon sf="lock" md="lock" />
        <NativeTabs.Trigger.Label>Encrypt</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan" testID="tab-scan">
        <NativeTabs.Trigger.Icon sf="qrcode.viewfinder" md="qr_code_scanner" />
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" testID="tab-settings">
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
