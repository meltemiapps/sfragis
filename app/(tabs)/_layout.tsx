import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors } from '../../utils/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.aegean,
        tabBarInactiveTintColor: colors.mist,
        tabBarStyle: { backgroundColor: colors.deep, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.abyss },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Keyring', tabBarButtonTestID: 'tab-keyring', tabBarIcon: tabIcon('key-outline') }} />
      <Tabs.Screen name="studio" options={{ title: 'Encrypt', tabBarButtonTestID: 'tab-encrypt', tabBarIcon: tabIcon('lock-closed-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarButtonTestID: 'tab-scan', tabBarIcon: tabIcon('scan-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarButtonTestID: 'tab-settings', tabBarIcon: tabIcon('settings-outline') }} />
    </Tabs>
  );
}
