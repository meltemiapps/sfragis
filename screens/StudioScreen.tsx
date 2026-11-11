import { useRouter } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useMemo, useState } from 'react';
import { Switch, StyleSheet, Text, View } from 'react-native';

import { KeyRow } from '../components/KeyRow';
import { OutputPanel } from '../components/OutputPanel';
import { usePassphrase } from '../components/PassphraseProvider';
import { Banner, Button, Field, Row, Screen, Segmented } from '../components/ui';
import { useKeyring } from '../services/KeyringProvider';
import * as pgp from '../services/pgpService';
import type { KeyRecord } from '../services/vault';
import { pasteText } from '../utils/clipboard';
import { errorMessage, isExpired, keyLabel, nextPaint } from '../utils/format';
import { colors, space, type } from '../utils/theme';

type Mode = 'encrypt' | 'decrypt';

const isUsable = (record: KeyRecord) => !record.info.isRevoked && !isExpired(record.info);

function EncryptPane() {
  const router = useRouter();
  const { keys, setQrPayload } = useKeyring();
  const withPassphrase = usePassphrase();
  const [text, setText] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [signerFingerprint, setSignerFingerprint] = useState<string | null>(null);
  const [signing, setSigning] = useState(true);
  const [output, setOutput] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const encryptable = useMemo(() => keys.filter((key) => isUsable(key) && key.info.canEncrypt), [keys]);
  const signers = useMemo(() => keys.filter((key) => key.armoredPrivate && isUsable(key) && key.info.canSign), [keys]);
  const signer = signers.find((key) => key.info.fingerprint === signerFingerprint) ?? signers[0];
  const chosen = encryptable.filter((key) => recipients.includes(key.info.fingerprint));
  const hasUnverified = chosen.some((key) => key.trust === 'unverified');

  const toggleRecipient = (fingerprint: string) =>
    setRecipients((current) =>
      current.includes(fingerprint) ? current.filter((item) => item !== fingerprint) : [...current, fingerprint],
    );

  const encrypt = async () => {
    setProblem(null);
    setOutput(null);
    // Sender's own key is included so the sender can reread what they sent.
    const publicKeys = new Set(chosen.map((key) => key.armoredPublic));
    try {
      if (signing && signer?.armoredPrivate) {
        const armoredPrivate = signer.armoredPrivate;
        publicKeys.add(signer.armoredPublic);
        const result = await withPassphrase(
          { title: 'Sign this message', detail: `Enter the passphrase for ${keyLabel(signer.info)}.`, actionLabel: 'Encrypt and sign' },
          (passphrase) =>
            pgp.encryptText({ text, recipientPublicKeys: [...publicKeys], signer: { armoredPrivate, passphrase } }),
        );
        if (!result.cancelled) setOutput(result.value);
      } else {
        setBusy(true);
        await nextPaint();
        setOutput(await pgp.encryptText({ text, recipientPublicKeys: [...publicKeys] }));
      }
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const showQr = () => {
    if (!output) return;
    setQrPayload(output);
    router.push({ pathname: '/qr', params: { title: 'Encrypted message' } });
  };

  if (encryptable.length === 0) {
    return <Banner tone="info">Add a public key to your keyring to choose a recipient.</Banner>;
  }

  return (
    <>
      <Text style={type.label}>Recipients</Text>
      <View style={styles.list}>
        {encryptable.map((key) => (
          <KeyRow
            key={key.info.fingerprint}
            record={key}
            selected={recipients.includes(key.info.fingerprint)}
            onPress={() => toggleRecipient(key.info.fingerprint)}
          />
        ))}
      </View>
      {hasUnverified ? <Banner tone="warn">A chosen recipient’s fingerprint has not been verified.</Banner> : null}

      <Field label="Message" value={text} onChangeText={setText} multiline autoCapitalize="sentences" autoCorrect={false} />

      {signers.length > 0 ? (
        <>
          <View style={styles.switchRow}>
            <Text style={type.label}>Sign as me</Text>
            <Switch
              testID="switch-sign"
              accessibilityLabel="Sign as me"
              value={signing}
              onValueChange={setSigning}
              trackColor={{ true: colors.aegean, false: colors.line }}
            />
          </View>
          {signing && signers.length > 1 ? (
            <Segmented
              value={signer?.info.fingerprint ?? ''}
              onChange={setSignerFingerprint}
              options={signers.map((key) => ({ label: keyLabel(key.info), value: key.info.fingerprint }))}
            />
          ) : null}
        </>
      ) : null}

      {problem ? <Banner tone="bad">{problem}</Banner> : null}
      <Button label="Encrypt" icon="lock-closed-outline" onPress={encrypt} busy={busy} disabled={!text || chosen.length === 0} />
      {output ? <OutputPanel title="Encrypted message" text={output} sensitive={false} code onShowQr={showQr} /> : null}
    </>
  );
}

function SignatureBanner({ signature }: { signature: pgp.SignatureStatus }) {
  switch (signature.state) {
    case 'valid':
      return <Banner tone="ok">Signed by {signature.signer ? keyLabel(signature.signer) : signature.keyId}.</Banner>;
    case 'unknown':
      return <Banner tone="warn">Signed by {signature.keyId}, a key you do not have. The signature could not be checked.</Banner>;
    case 'invalid':
      return <Banner tone="bad">The signature is invalid. Do not trust this message.</Banner>;
    default:
      return <Banner tone="info">This message is not signed, so the sender cannot be confirmed.</Banner>;
  }
}

function DecryptPane({ initialText }: { initialText: string }) {
  const { keys } = useKeyring();
  const withPassphrase = usePassphrase();
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<pgp.DecryptionResult | null>(null);
  const [candidates, setCandidates] = useState<KeyRecord[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  // Android blocks screenshots and recents thumbnails while plaintext is on screen.
  const hasPlaintext = result !== null;
  useEffect(() => {
    if (!hasPlaintext) return undefined;
    const tag = 'decrypted-output';
    void ScreenCapture.preventScreenCaptureAsync(tag);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync(tag);
    };
  }, [hasPlaintext]);

  const unlockWith = async (record: KeyRecord) => {
    const armoredPrivate = record.armoredPrivate;
    if (!armoredPrivate) return;
    setCandidates([]);
    try {
      const outcome = await withPassphrase(
        { title: 'Decrypt this message', detail: `Enter the passphrase for ${keyLabel(record.info)}.`, actionLabel: 'Decrypt' },
        (passphrase) =>
          pgp.decryptText({
            armoredMessage: text,
            armoredPrivate,
            passphrase,
            verificationKeys: keys.map((key) => key.armoredPublic),
          }),
      );
      if (!outcome.cancelled) setResult(outcome.value);
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };

  const decrypt = async () => {
    setProblem(null);
    setResult(null);
    try {
      const { keyIds, isAnonymous } = await pgp.readMessageRecipients(text);
      const privateKeys = keys.filter((key) => key.armoredPrivate);
      const matches = isAnonymous
        ? privateKeys
        : privateKeys.filter((key) => key.info.allKeyIds.some((id) => keyIds.includes(id)));
      if (matches.length === 0) {
        setProblem(`None of your keys can open this message. It was encrypted to: ${keyIds.join(', ')}.`);
      } else if (matches.length === 1) {
        await unlockWith(matches[0]);
      } else {
        setCandidates(matches);
      }
    } catch (error) {
      setProblem(errorMessage(error));
    }
  };

  const clear = () => {
    setText('');
    setResult(null);
    setProblem(null);
    setCandidates([]);
  };

  return (
    <>
      <Row>
        <Button label="Paste" icon="clipboard-outline" tone="quiet" onPress={() => void pasteText().then(setText)} />
        <Button label="Clear" tone="quiet" onPress={clear} />
      </Row>
      <Field label="Encrypted message" value={text} onChangeText={setText} multiline code placeholder="-----BEGIN PGP MESSAGE-----" />
      {problem ? <Banner tone="bad">{problem}</Banner> : null}
      <Button label="Decrypt" icon="lock-open-outline" onPress={decrypt} disabled={!text.trim()} />
      {candidates.length > 0 ? (
        <View style={styles.list}>
          <Text style={type.label}>Choose a key to try</Text>
          {candidates.map((key) => (
            <KeyRow key={key.info.fingerprint} record={key} onPress={() => void unlockWith(key)} />
          ))}
        </View>
      ) : null}
      {result ? (
        <>
          <SignatureBanner signature={result.signature} />
          <OutputPanel title="Decrypted message" text={result.text} sensitive code={false} />
        </>
      ) : null}
    </>
  );
}

export function StudioScreen() {
  const { stagedMessage } = useKeyring();
  const stagedId = stagedMessage?.id ?? 0;
  const [mode, setMode] = useState<Mode>(stagedId > 0 ? 'decrypt' : 'encrypt');
  const [seenStagedId, setSeenStagedId] = useState(stagedId);

  // A newly scanned message opens the Decrypt pane.
  if (seenStagedId !== stagedId) {
    setSeenStagedId(stagedId);
    setMode('decrypt');
  }

  return (
    <Screen title="Encrypt">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { label: 'Encrypt', value: 'encrypt' },
          { label: 'Decrypt', value: 'decrypt' },
        ]}
      />
      {mode === 'encrypt' ? <EncryptPane /> : <DecryptPane key={stagedId} initialText={stagedMessage?.text ?? ''} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
