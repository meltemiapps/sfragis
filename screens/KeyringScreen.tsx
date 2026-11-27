import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { KeyRow } from '../components/KeyRow';
import { ActionGroup, Banner, Button, Screen } from '../components/ui';
import { useKeyring } from '../services/KeyringProvider';
import { errorMessage } from '../utils/format';
import { colors, space, type } from '../utils/theme';

export function KeyringScreen() {
  const router = useRouter();
  const { keys, status, statusMessage, retry, eraseAll } = useKeyring();

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
    <ActionGroup
      actions={[
        { label: 'Import', icon: 'download-outline', onPress: () => router.push('/key/import') },
        { label: 'Generate', icon: 'add', onPress: () => router.push('/key/generate') },
      ]}
    />
  );

  return (
    <Screen title="Keyring" scroll={false} actions={actions}>
      <FlatList
        style={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
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
            <Button label="Generate your key" icon="add" onPress={() => router.push('/key/generate')} />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, marginHorizontal: -space.lg, marginBottom: -space.xxl },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  separator: { height: space.sm },
  empty: { gap: space.md, paddingTop: space.xl },
});
