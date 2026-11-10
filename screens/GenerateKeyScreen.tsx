import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Banner, Button, Field, PassphraseField, Screen, Segmented } from '../components/ui';
import { useKeyring } from '../services/KeyringProvider';
import * as pgp from '../services/pgpService';
import { errorMessage, nextPaint } from '../utils/format';
import { type } from '../utils/theme';

type ExpiryChoice = '365' | '730' | '0';

export function GenerateKeyScreen() {
  const router = useRouter();
  const { addGenerated } = useKeyring();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [algorithm, setAlgorithm] = useState<pgp.KeyAlgorithmChoice>('ed25519');
  const [expiry, setExpiry] = useState<ExpiryChoice>('730');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mismatch = confirmation.length > 0 && confirmation !== passphrase;
  const ready = name.trim() && email.trim() && passphrase.length >= pgp.MIN_PASSPHRASE_LENGTH && passphrase === confirmation;

  const generate = async () => {
    setBusy(true);
    setProblem(null);
    await nextPaint();
    try {
      const key = await pgp.generateKeyPair({ name, email, passphrase, algorithm, expiresInDays: Number(expiry) });
      setPassphrase('');
      setConfirmation('');
      await addGenerated(key);
      router.replace(`/key/${key.info.fingerprint}`);
    } catch (error) {
      setProblem(errorMessage(error));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" editable={!busy} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" editable={!busy} />

      <Text style={type.label}>Key type</Text>
      <Segmented
        value={algorithm}
        onChange={setAlgorithm}
        options={[
          { label: 'Ed25519', value: 'ed25519' },
          { label: 'RSA 4096', value: 'rsa4096' },
        ]}
      />
      <Text style={type.note}>
        {algorithm === 'ed25519'
          ? 'Fast and strong, and read by GnuPG 2.1 or later. Recommended.'
          : 'For systems that only accept RSA. Generation can take up to a minute. Keep the app open.'}
      </Text>

      <Text style={type.label}>Expires</Text>
      <Segmented
        value={expiry}
        onChange={setExpiry}
        options={[
          { label: '1 year', value: '365' },
          { label: '2 years', value: '730' },
          { label: 'Never', value: '0' },
        ]}
      />

      <PassphraseField
        label="Passphrase"
        value={passphrase}
        onChangeText={setPassphrase}
        hint={`At least ${pgp.MIN_PASSPHRASE_LENGTH} characters. It cannot be recovered if you forget it.`}
        editable={!busy}
      />
      <PassphraseField
        label="Confirm passphrase"
        value={confirmation}
        onChangeText={setConfirmation}
        error={mismatch ? 'The passphrases do not match.' : null}
        editable={!busy}
      />

      {problem ? <Banner tone="bad">{problem}</Banner> : null}
      {busy ? <Banner tone="info">Generating your key. The app may not respond until this finishes.</Banner> : null}
      <Button label="Generate key" onPress={generate} busy={busy} disabled={!ready} />
    </Screen>
  );
}
