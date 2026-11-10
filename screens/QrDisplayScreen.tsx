import { useEffect } from 'react';
import { Text } from 'react-native';

import { AnimatedQr } from '../components/AnimatedQr';
import { Screen } from '../components/ui';
import { useKeyring } from '../services/KeyringProvider';
import { type } from '../utils/theme';

export function QrDisplayScreen() {
  const { qrPayload, setQrPayload } = useKeyring();

  useEffect(() => () => setQrPayload(null), [setQrPayload]);

  return (
    <Screen>{qrPayload ? <AnimatedQr payload={qrPayload} /> : <Text style={type.body}>Nothing to show.</Text>}</Screen>
  );
}
