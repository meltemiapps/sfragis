import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, glass, space } from '../utils/theme';

/**
 * True when iOS can draw Liquid Glass (iOS 26 and later) and the user has not turned on
 * Reduce Transparency. Everywhere else the same components draw a plain translucent surface.
 */
export function useGlassEnabled(): boolean {
  const supported = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!supported) return undefined;
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (live) setReduced(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => {
      live = false;
      subscription.remove();
    };
  }, [supported]);

  return supported && !reduced;
}

/** The gradient behind every screen. Decorative only, so it is hidden from assistive technology. */
export function Backdrop() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.backdrop]}
    />
  );
}

/**
 * A floating surface for chrome: rows, toolbars, chips, quiet buttons and sheets.
 * Never put a fingerprint, an armored block, decrypted text or a QR code on it; use SolidPanel.
 */
export function GlassSurface({
  children,
  style,
  interactive = false,
  radius = glass.radius.row,
  testID,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  radius?: number;
  testID?: string;
}) {
  const enabled = useGlassEnabled();
  if (enabled) {
    return (
      <GlassView
        testID={testID}
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive={interactive}
        style={[{ borderRadius: radius }, style]}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View testID={testID} style={[styles.fallback, { borderRadius: radius }, style]}>
      {children}
    </View>
  );
}

/** An opaque panel for content that must stay readable and scannable on any backdrop. */
export function SolidPanel({ children, style, testID }: { children?: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} style={[styles.solid, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.abyss, experimental_backgroundImage: glass.backdrop },
  fallback: { backgroundColor: glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: glass.border },
  solid: {
    backgroundColor: glass.solid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glass.solidBorder,
    borderRadius: glass.radius.panel,
    padding: space.lg,
    gap: space.md,
  },
});
