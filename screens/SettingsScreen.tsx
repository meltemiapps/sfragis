import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Linking, Text } from 'react-native';

import { Banner, Button, Field, Panel, Screen } from '../components/ui';
import { useKeyring } from '../services/KeyringProvider';
import { runSelfTest } from '../services/pgpService';
import { APP_NAME, PUBLISHER_NAME, PUBLISHER_URL, SOURCE_CODE_URL } from '../utils/constants';
import { errorMessage, nextPaint } from '../utils/format';
import { type } from '../utils/theme';

const ERASE_WORD = 'erase';

export function SettingsScreen() {
  const { keys, eraseAll } = useKeyring();
  const [confirmation, setConfirmation] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selfTest = async () => {
    setTesting(true);
    setTestResult(null);
    await nextPaint();
    try {
      const { ed25519Ms, rsa4096Ms } = await runSelfTest();
      setTestResult({ ok: true, message: `Passed. Ed25519 ${ed25519Ms} ms, RSA 4096 ${rsa4096Ms} ms.` });
    } catch (error) {
      setTestResult({ ok: false, message: `Failed: ${errorMessage(error)}` });
    } finally {
      setTesting(false);
    }
  };

  const erase = () =>
    Alert.alert('Erase everything?', `${keys.length} stored key(s) will be permanently deleted.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Erase',
        style: 'destructive',
        onPress: () => {
          eraseAll()
            .then(() => setConfirmation(''))
            .catch((error) => setProblem(errorMessage(error)));
        },
      },
    ]);

  return (
    <Screen title="Settings">
      <Panel>
        <Text style={type.heading}>Privacy</Text>
        <Text style={type.body}>
          {APP_NAME} has no accounts, analytics or telemetry. Keys and messages stay on this device unless you share them.
        </Text>
      </Panel>

      <Panel>
        <Text style={type.heading}>How your keys are stored</Text>
        <Text style={type.body}>
          Your keyring is encrypted with a key held in this device’s secure keychain. Each private key is also locked by
          its own passphrase, which is never saved. Keyrings do not transfer to a new device, so export any key you need
          to keep.
        </Text>
      </Panel>

      <Panel>
        <Text style={type.heading}>About</Text>
        <Text style={type.body}>
          {APP_NAME} {Constants.expoConfig?.version} by {PUBLISHER_NAME}. Open source under the MIT licence. Cryptography
          by OpenPGP.js (LGPL-3.0).
        </Text>
        {SOURCE_CODE_URL ? <Button label="View source code" tone="quiet" onPress={() => void Linking.openURL(SOURCE_CODE_URL)} /> : null}
        {PUBLISHER_URL ? <Button label={`Visit ${PUBLISHER_NAME}`} tone="quiet" onPress={() => void Linking.openURL(PUBLISHER_URL)} /> : null}
      </Panel>

      <Panel>
        <Text style={type.heading}>Check this device</Text>
        <Text style={type.note}>Generates temporary keys, encrypts, signs, decrypts and verifies. Nothing is stored.</Text>
        <Button label="Run self-test" tone="quiet" busy={testing} onPress={selfTest} />
        {testResult ? <Banner tone={testResult.ok ? 'ok' : 'bad'}>{testResult.message}</Banner> : null}
      </Panel>

      <Panel>
        <Text style={type.heading}>Erase keyring</Text>
        <Field
          label={`Type "${ERASE_WORD}" to confirm`}
          value={confirmation}
          onChangeText={setConfirmation}
        />
        {problem ? <Banner tone="bad">{problem}</Banner> : null}
        <Button label="Erase keyring" tone="danger" disabled={confirmation.trim().toLowerCase() !== ERASE_WORD} onPress={erase} />
      </Panel>
    </Screen>
  );
}
