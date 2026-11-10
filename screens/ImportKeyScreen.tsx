import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Banner, Button, Field, PassphraseField, Row, Screen } from '../components/ui';
import { useKeyring } from '../services/KeyringProvider';
import * as pgp from '../services/pgpService';
import { pasteText } from '../utils/clipboard';
import { errorMessage, keyLabel, nextPaint } from '../utils/format';
import { type } from '../utils/theme';

export function ImportKeyScreen() {
  const router = useRouter();
  const { importParsed } = useKeyring();
  const [text, setText] = useState('');
  const [pendingUnprotected, setPendingUnprotected] = useState<pgp.ParsedKey[] | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const store = async (parsed: pgp.ParsedKey[]) => {
    const outcomes = [];
    for (const key of parsed) outcomes.push(await importParsed(key));
    if (outcomes.length === 1) {
      router.replace(`/key/${outcomes[0].record.info.fingerprint}`);
    } else {
      router.back();
    }
  };

  const process = async (input: string | Uint8Array) => {
    setBusy(true);
    setProblem(null);
    await nextPaint();
    try {
      const parsed = await pgp.parseKeys(input);
      if (parsed.some((key) => key.isUnprotected)) {
        setPendingUnprotected(parsed);
      } else {
        await store(parsed);
      }
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const protectAndStore = async () => {
    if (!pendingUnprotected) return;
    setBusy(true);
    setProblem(null);
    await nextPaint();
    try {
      const secured: pgp.ParsedKey[] = [];
      for (const key of pendingUnprotected) {
        if (key.isUnprotected && key.armoredPrivate) {
          const armored = await pgp.protectPrivateKey(key.armoredPrivate, passphrase);
          secured.push(...(await pgp.parseKeys(armored)));
        } else {
          secured.push(key);
        }
      }
      setPassphrase('');
      await store(secured);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    setProblem(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
      if (result.canceled) return;
      const file = new File(result.assets[0].uri);
      const bytes = await file.bytes();
      // The picker's copy may hold a private key, so it must not outlive this step.
      if (file.exists) file.delete();
      const opening = new TextDecoder().decode(bytes.slice(0, 16));
      await process(opening.includes('-----BEGIN') ? new TextDecoder().decode(bytes) : bytes);
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };

  if (pendingUnprotected) {
    const names = pendingUnprotected.filter((key) => key.isUnprotected).map((key) => keyLabel(key.info));
    return (
      <Screen>
        <Banner tone="warn">{names.join(', ')} has no passphrase. Set one to store it here.</Banner>
        <PassphraseField
          label="New passphrase"
          value={passphrase}
          onChangeText={setPassphrase}
          hint={`At least ${pgp.MIN_PASSPHRASE_LENGTH} characters.`}
        />
        {problem ? <Banner tone="bad">{problem}</Banner> : null}
        <Button
          label="Protect and import"
          onPress={protectAndStore}
          busy={busy}
          disabled={passphrase.length < pgp.MIN_PASSPHRASE_LENGTH}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={type.note}>Paste an armored key block, or choose a key file (.asc, .pgp, .gpg, .key).</Text>
      <Row>
        <Button label="Paste" icon="clipboard-outline" tone="quiet" onPress={() => void pasteText().then(setText)} />
        <Button label="Choose file" icon="document-outline" tone="quiet" onPress={pickFile} />
        <Button label="Scan QR" icon="scan-outline" tone="quiet" onPress={() => router.navigate('/(tabs)/scan')} />
      </Row>
      <Field label="Key block" value={text} onChangeText={setText} multiline code placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----" />
      {problem ? <Banner tone="bad">{problem}</Banner> : null}
      <Button label="Import key" onPress={() => void process(text)} busy={busy} disabled={!text.trim()} />
    </Screen>
  );
}
