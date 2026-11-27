import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, glass, mono, space, type } from '../utils/theme';
import { Backdrop, GlassSurface } from './Glass';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Titles already start large; past 1.5x they break long names mid-word. Body text scales fully. */
export const TITLE_MAX_SCALE = 1.5;

/**
 * True at the accessibility text sizes (Dynamic Type AX1 and up, about 1.3x),
 * where side-by-side controls would break words mid-way, so they stack instead.
 */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= 1.3;
}

/** Stable automation ID derived from a visible label, e.g. "Key block" -> "key-block". */
export function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Every screen draws the backdrop. Scrolling content runs under the system tab bar and any
 * transparent header; `contentInsetAdjustmentBehavior` keeps the ends reachable on iOS.
 * `actions` is the glass action group at the top right of a titled screen.
 */
export function Screen({
  children,
  scroll = true,
  title,
  actions,
}: {
  children: ReactNode;
  scroll?: boolean;
  title?: string;
  actions?: ReactNode;
}) {
  const large = useLargeText();
  const heading = title ? (
    <Text style={[type.title, styles.titleText]} accessibilityRole="header" maxFontSizeMultiplier={TITLE_MAX_SCALE}>
      {title}
    </Text>
  ) : null;
  const header = heading ? (
    actions ? (
      <View style={[styles.titleRow, large && styles.stacked]}>
        {heading}
        {actions}
      </View>
    ) : (
      heading
    )
  ) : null;
  return (
    <SafeAreaView style={styles.screen} edges={title ? ['top', 'left', 'right'] : ['left', 'right']}>
      <Backdrop />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.content}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            {header}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.flex]}>
            {header}
            {children}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type ButtonTone = 'primary' | 'quiet' | 'danger';

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  busy = false,
  disabled = false,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const inactive = disabled || busy;
  const foreground = tone === 'primary' ? colors.onAegean : tone === 'danger' ? colors.wax : colors.foam;
  return (
    <Pressable
      testID={testID ?? `button-${slug(label)}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' ? styles.buttonPrimary : styles.buttonGlass,
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {tone === 'primary' ? null : <GlassSurface style={StyleSheet.absoluteFill} radius={glass.radius.control} interactive />}
      {busy ? <ActivityIndicator color={foreground} /> : icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
      <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

/** The glass group of compact actions at the top right of a titled screen. */
export function ActionGroup({ actions }: { actions: { label: string; icon: IconName; onPress: () => void }[] }) {
  // At accessibility text sizes the actions stack, full width, instead of overflowing the row.
  const large = useLargeText();
  return (
    <GlassSurface radius={glass.radius.control} style={[styles.actionGroup, large && styles.actionGroupStacked]}>
      <View style={[styles.actionRow, large && styles.actionColumn]}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            testID={`button-${slug(action.label)}`}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Ionicons name={action.icon} size={18} color={colors.foam} />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </GlassSurface>
  );
}

export function Field({
  label,
  hint,
  error,
  code = false,
  style,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null; code?: boolean }) {
  // Armored blocks are read and compared, so a code field is opaque rather than glass.
  const Surface = code ? SolidField : GlassSurface;
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <Surface radius={glass.radius.field}>
        <TextInput
          testID={`field-${slug(label)}`}
          accessibilityLabel={label}
          placeholderTextColor={colors.mist}
          selectionColor={colors.aegean}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={[styles.input, input.multiline && styles.inputMultiline, code && styles.inputCode, style]}
          {...input}
        />
      </Surface>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={type.note}>{hint}</Text> : null}
    </View>
  );
}

function SolidField({ children, radius }: { children: ReactNode; radius: number }) {
  return <View style={[styles.solidField, { borderRadius: radius }]}>{children}</View>;
}

/**
 * OpenPGP passphrases must never reach the system password manager. On iOS,
 * `textContentType="none"` no longer stops "Use Strong Password?" on two adjacent
 * secure fields, which would save the passphrase to Passwords/iCloud Keychain.
 * `oneTimeCode` is the content type that opts a secure field out of password AutoFill.
 */
export function PassphraseField(props: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <Field
      secureTextEntry
      autoComplete="off"
      textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : 'none'}
      importantForAutofill="no"
      {...props}
    />
  );
}

/**
 * A glass group of prose and controls, such as a Settings section. Anything that must stay
 * readable or scannable (fingerprints, key details, armored text) goes in SolidPanel instead.
 */
export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <GlassSurface radius={glass.radius.row} style={[styles.panel, style]}>
      {children}
    </GlassSurface>
  );
}

export function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  const accent = { ok: colors.leaf, warn: colors.sand, bad: colors.wax, info: colors.aegean }[tone];
  return (
    <GlassSurface radius={glass.radius.field}>
      <View style={styles.banner} accessibilityRole="alert">
        <View style={[styles.bannerAccent, { backgroundColor: accent }]} />
        <Text style={[type.body, styles.flex]}>{children}</Text>
      </View>
    </GlassSurface>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const large = useLargeText();
  return (
    <GlassSurface radius={glass.radius.segment} style={[styles.segmented, large && styles.stacked]}>
      <View style={[styles.segmentRow, large && styles.stacked]} accessibilityRole="tablist">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={`segment-${slug(option.value)}`}
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.segment, large && styles.segmentStacked, selected && styles.segmentSelected]}
            >
              <Text style={[type.label, selected && styles.segmentLabelSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

export function Fingerprint({ value }: { value: string }) {
  return (
    <Text selectable style={styles.fingerprint}>
      {value}
    </Text>
  );
}

export function Row({ children }: { children: ReactNode }) {
  const large = useLargeText();
  return <View style={[styles.row, large && styles.stacked]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  titleText: { marginTop: space.sm, flexShrink: 1 },
  button: {
    minHeight: 46,
    borderRadius: glass.radius.control,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonPrimary: { backgroundColor: colors.aegean, borderRadius: glass.radius.primary, minHeight: 50 },
  buttonGlass: { overflow: 'hidden' },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  actionGroup: { alignSelf: 'flex-start', marginTop: space.sm, padding: 3 },
  actionGroupStacked: { alignSelf: 'stretch' },
  actionRow: { flexDirection: 'row' },
  actionColumn: { flexDirection: 'column' },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 40, paddingHorizontal: space.md },
  actionLabel: { fontSize: 15, fontWeight: '600', color: colors.foam },
  pressed: { opacity: 0.75 },
  inactive: { opacity: 0.45 },
  field: { gap: space.sm },
  input: {
    color: colors.foam,
    fontSize: 16,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: 46,
  },
  solidField: { backgroundColor: glass.solid, borderWidth: StyleSheet.hairlineWidth, borderColor: glass.solidBorder },
  inputMultiline: { minHeight: 132, textAlignVertical: 'top' },
  inputCode: { fontFamily: mono, fontSize: 13, lineHeight: 18 },
  error: { ...type.note, color: colors.wax },
  panel: { padding: space.lg, gap: space.md },
  banner: { flexDirection: 'row', gap: space.md, padding: space.md, alignItems: 'stretch' },
  bannerAccent: { width: 4, borderRadius: 2 },
  segmented: { padding: space.xs },
  segmentRow: { flexDirection: 'row', gap: space.xs },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: glass.radius.segment - space.xs },
  segmentStacked: { flex: 0, paddingVertical: space.sm, paddingHorizontal: space.md },
  stacked: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  segmentSelected: { backgroundColor: glass.bright },
  segmentLabelSelected: { color: '#FFFFFF' },
  fingerprint: { fontFamily: mono, fontSize: 15, lineHeight: 24, color: colors.foam },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
