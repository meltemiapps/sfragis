import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { KeyRow } from '../components/KeyRow';
import { Banner, Button, Row, Screen, useLargeText } from '../components/ui';
import { useKeyring } from '../services/KeyringProvider';
import { errorMessage } from '../utils/format';
import { colors, space, type } from '../utils/theme';

export function KeyringScreen() {
  const router = useRouter();
  const { keys, status, statusMessage, retry, eraseAll } = useKeyring();
  const largeText = useLargeText();

  if (status === 'loading') {
    return (
      <Screen title="Keyring" scroll={false}>
        <ActivityIndicator color={colors.aegean} accessibilityLabel="Opening keyring" />
      </Screen>
    );
  }

  if (status === 'unreadable') {
    const confirmReset = () =>
      Alert.alert('Erase the keyring?', 'Every stored key will be permanently deleted. This cannot be undone.', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Erase',
          style: 'destructive',
          onPress: () => eraseAll().catch((error) => Alert.alert('Erase failed', errorMessage(error))),
        },
      ]);
    return (
      <Screen title="Keyring">
        <Banner tone="bad">{statusMessage}</Banner>
        <Text style={type.body}>
          Your stored keys have not been changed. If you restored this device from a backup, the keyring cannot be read
          here and you will need your exported keys.
        </Text>
        <Button label="Try again" onPress={retry} />
        <Button label="Erase keyring" tone="danger" onPress={confirmReset} />
      </Screen>
    );
  }

  const actions = (
    <Row>
      <Button label="Generate" icon="add" onPress={() => router.push('/key/generate')} style={largeText ? undefined : styles.action} />
      <Button label="Import" icon="download-outline" tone="quiet" onPress={() => router.push('/key/import')} style={largeText ? undefined : styles.action} />
    </Row>
  );

  return (
    <Screen title="Keyring" scroll={false}>
      {actions}
      <FlatList
        style={styles.list}
        data={keys}
        keyExtractor={(item) => item.info.fingerprint}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <KeyRow record={item} onPress={() => router.push(`/key/${item.info.fingerprint}`)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={type.heading}>No keys yet</Text>
            <Text style={type.note}>
              Generate your own key to receive encrypted messages, or import a contact’s public key to write to them.
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  list: { flex: 1 },
  separator: { height: space.sm },
  empty: { gap: space.sm, paddingTop: space.xl },
});
