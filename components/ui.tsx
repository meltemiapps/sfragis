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

import { colors, mono, radius, space, type } from '../utils/theme';

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

export function Screen({ children, scroll = true, title }: { children: ReactNode; scroll?: boolean; title?: string }) {
  const header = title ? <Text style={[type.title, styles.title]} accessibilityRole="header" maxFontSizeMultiplier={TITLE_MAX_SCALE}>{title}</Text> : null;
  return (
    <SafeAreaView style={styles.screen} edges={title ? ['top', 'left', 'right'] : ['left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        tone === 'primary' && styles.buttonPrimary,
        tone === 'quiet' && styles.buttonQuiet,
        tone === 'danger' && styles.buttonDanger,
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={foreground} /> : icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
      <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
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
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
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
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={type.note}>{hint}</Text> : null}
    </View>
  );
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

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  const accent = { ok: colors.leaf, warn: colors.sand, bad: colors.wax, info: colors.aegean }[tone];
  return (
    <View style={[styles.banner, { borderLeftColor: accent }]} accessibilityRole="alert">
      <Text style={type.body}>{children}</Text>
    </View>
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
    <View style={[styles.segmented, large && styles.stacked]} accessibilityRole="tablist">
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
            <Text style={[type.label, selected && { color: colors.onAegean }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
  title: { marginTop: space.sm },
  button: {
    minHeight: 46,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonPrimary: { backgroundColor: colors.aegean },
  buttonQuiet: { backgroundColor: colors.raised },
  buttonDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.wax },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  inactive: { opacity: 0.45 },
  field: { gap: space.sm },
  input: {
    backgroundColor: colors.deep,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    color: colors.foam,
    fontSize: 16,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: 46,
  },
  inputMultiline: { minHeight: 132, textAlignVertical: 'top' },
  inputCode: { fontFamily: mono, fontSize: 13, lineHeight: 18 },
  error: { ...type.note, color: colors.wax },
  panel: { backgroundColor: colors.deep, borderRadius: radius.panel, padding: space.lg, gap: space.md },
  banner: { backgroundColor: colors.deep, borderLeftWidth: 3, padding: space.md, borderRadius: 4 },
  segmented: { flexDirection: 'row', backgroundColor: colors.deep, borderRadius: radius.control, padding: space.xs },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentStacked: { flex: 0, paddingVertical: space.sm, paddingHorizontal: space.md },
  stacked: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  segmentSelected: { backgroundColor: colors.aegean },
  fingerprint: { fontFamily: mono, fontSize: 15, lineHeight: 24, color: colors.foam },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
