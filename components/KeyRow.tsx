import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { KeyRecord } from '../services/vault';
import { isExpired, keyLabel, keyStatusLabel, shortFingerprint } from '../utils/format';
import { colors, glass, mono, space, type } from '../utils/theme';
import { GlassSurface, TrustPill } from './Glass';
import { SealGlyph } from './SealGlyph';

export function keyKind(record: KeyRecord): string {
  return record.armoredPrivate ? 'Your key' : record.trust === 'verified' ? 'Verified contact' : 'Unverified contact';
}

export function keyTrust(record: KeyRecord): 'own' | 'verified' | 'unverified' {
  return record.armoredPrivate ? 'own' : record.trust === 'verified' ? 'verified' : 'unverified';
}

/** The accessibility label the Maestro flows match: "<name>, <kind>, <status>". */
export function keyAccessibilityLabel(record: KeyRecord): string {
  return `${keyLabel(record.info)}, ${keyKind(record)}, ${keyStatusLabel(record.info)}`;
}

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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={keyAccessibilityLabel(record)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <GlassSurface radius={glass.radius.row} interactive tint={selected ? glass.selected : undefined}>
        <View style={styles.row}>
          <SealGlyph fingerprint={info.fingerprint} />
          <View style={styles.text}>
            <Text style={type.label}>{keyLabel(info)}</Text>
            {info.email ? <Text style={type.note}>{info.email}</Text> : null}
            <Text style={styles.fingerprint}>{shortFingerprint(info.fingerprint)}</Text>
            <View style={styles.meta}>
              <TrustPill trust={keyTrust(record)} />
              <Text style={[type.note, dead && styles.dead]}>{status}</Text>
            </View>
          </View>
        </View>
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  pressed: { opacity: 0.8 },
  text: { flex: 1, gap: 2 },
  fingerprint: { fontFamily: mono, fontSize: 13, lineHeight: 19, color: glass.ink },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: 2 },
  dead: { color: colors.wax },
});
