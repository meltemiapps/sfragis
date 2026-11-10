import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PassphraseProvider } from '../components/PassphraseProvider';
import { KeyringProvider } from '../services/KeyringProvider';
import { colors } from '../utils/theme';

const headerOptions = {
  headerStyle: { backgroundColor: colors.abyss },
  headerTintColor: colors.foam,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.abyss },
};

export default function RootLayout() {
  // Covers the app in the task switcher so keys and plaintext are not previewed.
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <KeyringProvider>
        <PassphraseProvider>
          <StatusBar style="light" />
          <Stack screenOptions={headerOptions}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="key/generate" options={{ title: 'Generate key' }} />
            <Stack.Screen name="key/import" options={{ title: 'Import key' }} />
            <Stack.Screen name="key/[fingerprint]" options={{ title: 'Key' }} />
            <Stack.Screen name="qr" options={({ route }) => ({
              title: (route.params as { title?: string } | undefined)?.title ?? 'QR code',
              presentation: 'modal',
            })} />
          </Stack>
          {isActive ? null : <View style={styles.privacyCover} />}
        </PassphraseProvider>
      </KeyringProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  privacyCover: { ...StyleSheet.absoluteFill, backgroundColor: colors.abyss },
});
