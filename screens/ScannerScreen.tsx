import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { SealGlyph } from '../components/SealGlyph';
import { Banner, Button, Fingerprint, Panel, Screen } from '../components/ui';
import { useKeyring } from '../services/KeyringProvider';
import * as pgp from '../services/pgpService';
import { FrameAssembler, isFrame } from '../services/qrTransport';
import { errorMessage, groupFingerprint, keyLabel } from '../utils/format';
import { colors, space, type } from '../utils/theme';

type Outcome =
  | { kind: 'imported'; fingerprint: string; wasKnown: boolean }
  | { kind: 'verified'; fingerprint: string }
  | { kind: 'mismatch'; fingerprint: string }
  | { kind: 'rejected'; message: string };

function CameraFallback({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  const router = useRouter();
  return (
    <Screen title="Scan">
      <Text style={type.heading}>{title}</Text>
      <Text style={type.body}>{detail}</Text>
      {children}
      <Button label="Import by text or file" tone="quiet" onPress={() => router.push('/key/import')} />
    </Screen>
  );
}

export function ScannerScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const { keys, importParsed, setTrust, stageMessage, getKey } = useKeyring();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  // Macs and some iPads have only a front camera, so the scanner can switch.
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const assembler = useRef(new FrameAssembler());
  const lastValue = useRef<string | null>(null);
  const handling = useRef(false);

  const restart = () => {
    assembler.current.reset();
    lastValue.current = null;
    handling.current = false;
    setProgress(null);
    setOutcome(null);
  };

  const importKeyBlock = useCallback(
    async (block: string) => {
      const parsed = await pgp.parseKeys(block);
      if (parsed.length !== 1) {
        setOutcome({ kind: 'rejected', message: 'This code holds more than one key. Import it from the Keyring tab.' });
        return;
      }
      const [key] = parsed;
      if (key.isUnprotected) {
        setOutcome({ kind: 'rejected', message: 'This private key has no passphrase. Import it from the Keyring tab to protect it.' });
        return;
      }
      const result = await importParsed(key);
      setOutcome({ kind: 'imported', fingerprint: result.record.info.fingerprint, wasKnown: result.wasKnown });
    },
    [importParsed],
  );

  const handlePayload = useCallback(
    async (payload: string) => {
      const fingerprint = pgp.parseFingerprintUri(payload);
      if (fingerprint) {
        const known = keys.find((key) => key.info.fingerprint === fingerprint);
        if (known) {
          if (known.trust !== 'own') await setTrust(fingerprint, 'verified');
          setOutcome({ kind: 'verified', fingerprint });
        } else {
          setOutcome({ kind: 'mismatch', fingerprint });
        }
        return;
      }
      if (pgp.looksLikeMessage(payload)) {
        stageMessage(payload);
        router.navigate('/(tabs)/studio');
        restart();
        return;
      }
      if (/-----BEGIN PGP PRIVATE KEY BLOCK-----/.test(payload)) {
        // A private key on someone's screen is unusual enough to require a decision.
        await new Promise<void>((resolve) =>
          Alert.alert('Import a private key?', 'Only continue if this is your own key and you started this transfer.', [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setOutcome({ kind: 'rejected', message: 'Private key not imported.' });
                resolve();
              },
            },
            {
              text: 'Import',
              onPress: () =>
                void importKeyBlock(payload)
                  .catch((error) => setOutcome({ kind: 'rejected', message: errorMessage(error) }))
                  .finally(resolve),
            },
          ]),
        );
        return;
      }
      if (pgp.looksLikeKeyBlock(payload)) {
        await importKeyBlock(payload);
        return;
      }
      setOutcome({ kind: 'rejected', message: 'This QR code does not contain a PGP key, message or fingerprint.' });
    },
    [importKeyBlock, keys, router, setTrust, stageMessage],
  );

  const onBarcode = useCallback(
    (scan: BarcodeScanningResult) => {
      if (handling.current || scan.data === lastValue.current) return;
      lastValue.current = scan.data;

      if (isFrame(scan.data)) {
        const state = assembler.current.add(scan.data);
        if (state.status === 'progress') {
          setProgress({ received: state.received, total: state.total });
          return;
        }
        if (state.status === 'failed') {
          setProgress(null);
          setOutcome({ kind: 'rejected', message: state.reason });
          handling.current = true;
          return;
        }
        if (state.status !== 'complete') return;
        setProgress(null);
        handling.current = true;
        handlePayload(state.payload).catch((error) => setOutcome({ kind: 'rejected', message: errorMessage(error) }));
        return;
      }

      handling.current = true;
      handlePayload(scan.data).catch((error) => setOutcome({ kind: 'rejected', message: errorMessage(error) }));
    },
    [handlePayload],
  );

  if (!permission) {
    return (
      <Screen title="Scan" scroll={false}>
        <ActivityIndicator color={colors.aegean} accessibilityLabel="Checking camera access" />
      </Screen>
    );
  }

  if (!permission.granted) {
    return permission.canAskAgain ? (
      <CameraFallback
        title="Allow camera access"
        detail="The camera reads QR codes on this device only. Images are never saved or sent anywhere."
      >
        <Button label="Allow camera" icon="camera-outline" onPress={() => void requestPermission()} />
      </CameraFallback>
    ) : (
      <CameraFallback
        title="Camera access is off"
        detail="Turn on camera access for Sfragis in system settings to scan QR codes. You can still import keys as text or files."
      >
        <Button label="Open settings" onPress={() => void Linking.openSettings()} />
      </CameraFallback>
    );
  }

  if (cameraFailed) {
    return (
      <CameraFallback
        title="No camera available"
        detail="This device could not start a camera. Import keys as text or files instead."
      />
    );
  }

  if (outcome) {
    const record = 'fingerprint' in outcome ? getKey(outcome.fingerprint) : undefined;
    return (
      <Screen title="Scan">
        {outcome.kind === 'imported' && record ? (
          <>
            <Banner tone="ok">{outcome.wasKnown ? `${keyLabel(record.info)} updated.` : `${keyLabel(record.info)} added to your keyring.`}</Banner>
            <Panel>
              <SealGlyph fingerprint={record.info.fingerprint} size={64} />
              <Fingerprint value={groupFingerprint(record.info.fingerprint)} />
              <Text style={type.note}>Check this fingerprint with its owner before you rely on the key.</Text>
            </Panel>
            <Button label="Open key" onPress={() => { router.push(`/key/${record.info.fingerprint}`); restart(); }} />
          </>
        ) : null}
        {outcome.kind === 'verified' && record ? (
          <Banner tone="ok">Fingerprint matches {keyLabel(record.info)}. This key is now verified.</Banner>
        ) : null}
        {outcome.kind === 'mismatch' ? (
          <>
            <Banner tone="bad">No key in your keyring has this fingerprint. Do not rely on any key you hold for this person.</Banner>
            <Fingerprint value={groupFingerprint(outcome.fingerprint)} />
          </>
        ) : null}
        {outcome.kind === 'rejected' ? <Banner tone="bad">{outcome.message}</Banner> : null}
        <Button label="Scan another" tone="quiet" onPress={restart} />
      </Screen>
    );
  }

  return (
    <Screen title="Scan" scroll={false}>
      <View style={styles.viewfinder}>
        {isFocused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcode}
            onMountError={() => (facing === 'back' ? setFacing('front') : setCameraFailed(true))}
          />
        ) : null}
      </View>
      {progress ? (
        <View accessibilityLiveRegion="polite">
          <Text style={type.label}>
            Read {progress.received} of {progress.total} parts
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(progress.received / progress.total) * 100}%` }]} />
          </View>
        </View>
      ) : (
        <Text style={type.note}>Point the camera at a public key, an encrypted message or a fingerprint code.</Text>
      )}
      <Button
        label="Switch camera"
        icon="camera-reverse-outline"
        tone="quiet"
        onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: { flex: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: colors.deep },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.raised, marginTop: space.sm, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.aegean },
});
