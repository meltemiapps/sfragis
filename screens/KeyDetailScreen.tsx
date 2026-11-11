import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { usePassphrase } from '../components/PassphraseProvider';
import { SealGlyph } from '../components/SealGlyph';
import { Banner, Button, Fingerprint, Panel, Row, Screen, TITLE_MAX_SCALE, useLargeText } from '../components/ui';
import { OutputPanel } from '../components/OutputPanel';
import { useKeyring } from '../services/KeyringProvider';
import * as pgp from '../services/pgpService';
import { copyPublic } from '../utils/clipboard';
import { errorMessage, formatDate, groupFingerprint, isExpired, keyLabel, keyStatusLabel } from '../utils/format';
import { space, type } from '../utils/theme';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={type.note}>{label}</Text>
      <Text style={type.body} selectable>
        {value}
      </Text>
    </View>
  );
}

export function KeyDetailScreen() {
  const router = useRouter();
  const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();
  const { getKey, setTrust, removeKey, applyUpdate, setQrPayload } = useKeyring();
  const withPassphrase = usePassphrase();
  const largeText = useLargeText();
  const [exportedPrivate, setExportedPrivate] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Android blocks screenshots and recents thumbnails while the private key is shown.
  const showingPrivate = exportedPrivate !== null;
  useEffect(() => {
    if (!showingPrivate) return undefined;
    const tag = 'private-key-export';
    void ScreenCapture.preventScreenCaptureAsync(tag);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync(tag);
    };
  }, [showingPrivate]);

  const record = getKey(fingerprint);
  if (!record) {
    return (
      <Screen>
        <Text style={type.body}>This key is no longer in your keyring.</Text>
      </Screen>
    );
  }

  const { info } = record;
  const armoredPrivate = record.armoredPrivate;
  const isContact = armoredPrivate === null;

  const showQr = (payload: string, title: string) => {
    setQrPayload(payload);
    router.push({ pathname: '/qr', params: { title } });
  };

  const exportPrivate = () => {
    if (!armoredPrivate) return;
    Alert.alert(
      'Reveal your private key?',
      'Anyone who gets this block and your passphrase can read your messages and sign as you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            withPassphrase(
              { title: 'Confirm it is you', detail: `Enter the passphrase for ${keyLabel(info)}.`, actionLabel: 'Reveal' },
              (passphrase) => pgp.verifyPassphrase(armoredPrivate, passphrase),
            )
              .then((result) => {
                if (!result.cancelled) setExportedPrivate(armoredPrivate);
              })
              .catch((error) => setProblem(errorMessage(error)));
          },
        },
      ],
    );
  };

  const revoke = () => {
    if (!armoredPrivate) return;
    const perform = (reason: pgp.RevocationReason) => {
      withPassphrase(
        { title: 'Revoke this key', detail: `Enter the passphrase for ${keyLabel(info)}.`, actionLabel: 'Revoke key' },
        (passphrase) => pgp.revokeKey({ armoredPrivate, passphrase, reason }),
      )
        .then(async (result) => {
          if (result.cancelled) return;
          await applyUpdate(info.fingerprint, result.value);
          Alert.alert('Key revoked', 'Share the updated public key so your contacts stop using it.');
        })
        .catch((error) => setProblem(errorMessage(error)));
    };
    Alert.alert('Revoke this key?', 'Revocation is permanent. Choose the reason your contacts will see.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'It was compromised', style: 'destructive', onPress: () => perform('compromised') },
      { text: 'I replaced it', onPress: () => perform('superseded') },
      { text: 'I no longer use it', onPress: () => perform('retired') },
    ]);
  };

  const remove = () => {
    const finish = () =>
      removeKey(info.fingerprint)
        .then(() => router.back())
        .catch((error) => setProblem(errorMessage(error)));
    const confirm = (title: string, message: string, onConfirm: () => void) =>
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onConfirm },
      ]);

    if (isContact) {
      confirm('Delete this contact key?', 'You can import it again later.', finish);
      return;
    }
    confirm('Delete your private key?', 'Messages encrypted to this key can no longer be read here.', () =>
      confirm('Delete permanently?', 'There is no undo. Export the key first if you may need it.', finish),
    );
  };

  return (
    <Screen>
      <View style={[styles.header, largeText && styles.headerStacked]}>
        <SealGlyph fingerprint={info.fingerprint} size={72} />
        <View style={styles.headerText}>
          <Text style={type.title} accessibilityRole="header" maxFontSizeMultiplier={TITLE_MAX_SCALE}>
            {keyLabel(info)}
          </Text>
          {info.email ? <Text style={type.note}>{info.email}</Text> : null}
        </View>
      </View>

      {info.isRevoked ? <Banner tone="bad">This key has been revoked and must not be used.</Banner> : null}
      {!info.isRevoked && isExpired(info) ? <Banner tone="bad">This key has expired.</Banner> : null}
      {record.trust === 'unverified' && !info.isRevoked ? (
        <Banner tone="warn">Compare this fingerprint with its owner in person or by call before you rely on it.</Banner>
      ) : null}
      {problem ? <Banner tone="bad">{problem}</Banner> : null}

      <Panel>
        <Text style={type.note}>Fingerprint</Text>
        <Fingerprint value={groupFingerprint(info.fingerprint)} />
        <Fact label="Algorithm" value={info.algorithm} />
        <Fact label="Created" value={formatDate(info.createdAt)} />
        <Fact label="Status" value={keyStatusLabel(info)} />
        <Fact label={info.userIds.length > 1 ? 'User IDs' : 'User ID'} value={info.userIds.join('\n')} />
      </Panel>

      <Text style={type.heading}>Share</Text>
      <Row>
        <Button label="Show QR" icon="qr-code-outline" onPress={() => showQr(record.armoredPublic, 'Public key')} />
        <Button
          label="Fingerprint QR"
          icon="finger-print-outline"
          tone="quiet"
          onPress={() => showQr(pgp.toFingerprintUri(info.fingerprint), 'Fingerprint')}
        />
        <Button label="Copy public key" icon="copy-outline" tone="quiet" onPress={() => void copyPublic(record.armoredPublic)} />
        <Button label="Share" icon="share-outline" tone="quiet" onPress={() => void Share.share({ message: record.armoredPublic })} />
      </Row>

      {isContact ? (
        <Button
          label={record.trust === 'verified' ? 'Mark as unverified' : 'I compared the fingerprint'}
          tone="quiet"
          onPress={() => void setTrust(info.fingerprint, record.trust === 'verified' ? 'unverified' : 'verified')}
        />
      ) : null}

      {!isContact ? (
        <>
          <Text style={type.heading}>Private key</Text>
          <Button label="Export private key" icon="key-outline" tone="quiet" onPress={exportPrivate} />
          {exportedPrivate ? <OutputPanel title="Private key" text={exportedPrivate} sensitive code /> : null}
          {!info.isRevoked ? <Button label="Revoke key" tone="danger" onPress={revoke} /> : null}
        </>
      ) : null}

      <Button label={isContact ? 'Delete contact key' : 'Delete key'} tone="danger" onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  headerStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  headerText: { flex: 1, alignSelf: 'stretch' },
  fact: { gap: 1 },
});
