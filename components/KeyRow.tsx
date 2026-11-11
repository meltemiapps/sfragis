import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { KeyRecord } from '../services/vault';
import { isExpired, keyLabel, keyStatusLabel, shortFingerprint } from '../utils/format';
import { colors, mono, space, type } from '../utils/theme';
import { SealGlyph } from './SealGlyph';

export function KeyRow({
  record,
  onPress,
  selected,
}: {
  record: KeyRecord;
  onPress: () => void;
  selected?: boolean;
}) {
  const { info } = record;
  const dead = info.isRevoked || isExpired(info);
  const status = keyStatusLabel(info);
  const kind = record.armoredPrivate ? 'Your key' : record.trust === 'verified' ? 'Verified contact' : 'Unverified contact';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={`${keyLabel(info)}, ${kind}, ${status}`}
      style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
    >
      <SealGlyph fingerprint={info.fingerprint} />
      <View style={styles.text}>
        <Text style={type.label}>{keyLabel(info)}</Text>
        {info.email ? <Text style={type.note}>{info.email}</Text> : null}
        <Text style={styles.fingerprint}>{shortFingerprint(info.fingerprint)}</Text>
        <Text style={[type.note, dead && styles.dead]}>
          {kind}, {status.charAt(0).toLowerCase() + status.slice(1)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.deep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.aegean },
  pressed: { opacity: 0.75 },
  text: { flex: 1, gap: 1 },
  fingerprint: { fontFamily: mono, fontSize: 13, lineHeight: 19, color: colors.aegean },
  dead: { color: colors.wax },
});
