import { useMemo } from 'react';
import Svg, { Circle, G, Line } from 'react-native-svg';

import { colors } from '../utils/theme';

const HUES = ['#4CC3CF', '#E3B65B', '#63CF94', '#E2877D', '#9EA8F0', '#D59AD8', '#7FC4F5', '#C8D46A'];

/**
 * A wax seal drawn from a key's fingerprint: every hex digit sets one spoke, so
 * two different keys look different at a glance. An aid to recognition only;
 * verification always means comparing the full fingerprint.
 */
export function SealGlyph({ fingerprint, size = 44 }: { fingerprint: string; size?: number }) {
  const { spokes, hue, pips } = useMemo(() => {
    const digits = Array.from(fingerprint.slice(0, 40), (char) => parseInt(char, 16) || 0);
    const trailing = fingerprint.slice(-8);
    return {
      spokes: digits,
      hue: HUES[parseInt(fingerprint.slice(0, 2), 16) % HUES.length],
      pips: Array.from(trailing, (char) => parseInt(char, 16) % 2 === 1),
    };
  }, [fingerprint]);

  const center = 50;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={center} cy={center} r={48} fill={colors.raised} />
      <G stroke={hue} strokeWidth={2.4} strokeLinecap="round">
        {spokes.map((digit, index) => {
          const angle = (index / spokes.length) * Math.PI * 2;
          const inner = 24;
          const outer = inner + 6 + (digit / 15) * 15;
          return (
            <Line
              key={index}
              x1={center + Math.cos(angle) * inner}
              y1={center + Math.sin(angle) * inner}
              x2={center + Math.cos(angle) * outer}
              y2={center + Math.sin(angle) * outer}
            />
          );
        })}
      </G>
      <Circle cx={center} cy={center} r={19} fill={hue} />
      {pips.map((filled, index) => {
        const angle = (index / pips.length) * Math.PI * 2;
        return (
          <Circle
            key={index}
            cx={center + Math.cos(angle) * 11}
            cy={center + Math.sin(angle) * 11}
            r={filled ? 3.2 : 1.6}
            fill={colors.abyss}
          />
        );
      })}
    </Svg>
  );
}
