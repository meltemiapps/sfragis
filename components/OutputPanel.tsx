import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { copyPublic, copySensitive } from '../utils/clipboard';
import { CLIPBOARD_CLEAR_SECONDS } from '../utils/constants';
import { colors, mono, space, type } from '../utils/theme';
import { SolidPanel } from './Glass';
import { Button, Row } from './ui';

export function OutputPanel({
  title,
  text,
  sensitive,
  code,
  onShowQr,
}: {
  title: string;
  text: string;
  sensitive: boolean;
  code: boolean;
  onShowQr?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await (sensitive ? copySensitive(text) : copyPublic(text));
    setCopied(true);
  };

  return (
    // Armored and decrypted text sits on an opaque panel; the actions float on glass below it.
    <View style={styles.wrap}>
      <Text style={type.heading}>{title}</Text>
      <SolidPanel>
        <Text selectable style={[styles.body, code && styles.code]}>
          {text}
        </Text>
      </SolidPanel>
      <Row>
        <Button label={copied ? 'Copied' : 'Copy'} icon="copy-outline" tone="quiet" onPress={copy} />
        <Button label="Share" icon="share-outline" tone="quiet" onPress={() => void Share.share({ message: text })} />
        {onShowQr ? <Button label="Show QR" icon="qr-code-outline" tone="quiet" onPress={onShowQr} /> : null}
      </Row>
      {sensitive && copied ? (
        <Text style={type.note}>The clipboard clears in {CLIPBOARD_CLEAR_SECONDS} seconds.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  body: { ...type.body, color: colors.foam, paddingVertical: space.xs },
  code: { fontFamily: mono, fontSize: 12, lineHeight: 17 },
});
