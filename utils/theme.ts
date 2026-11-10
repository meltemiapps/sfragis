import { Platform, type TextStyle } from 'react-native';

/** Aegean night palette. Wax red is reserved for irreversible actions. */
export const colors = {
  abyss: '#08151F',
  deep: '#0F2230',
  raised: '#173043',
  line: '#2A4A60',
  foam: '#EAF2F4',
  mist: '#A3B8C4',
  aegean: '#4CC3CF',
  onAegean: '#04232A',
  wax: '#E2675D',
  sand: '#E3B65B',
  leaf: '#63CF94',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { control: 10, panel: 14 } as const;

export const type = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.foam },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: colors.foam },
  body: { fontSize: 16, lineHeight: 23, color: colors.foam },
  note: { fontSize: 14, lineHeight: 20, color: colors.mist },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.foam },
} as const satisfies Record<string, TextStyle>;

/** Fingerprints and armored blocks are the only text set in a fixed-width face. */
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
