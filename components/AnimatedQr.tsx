import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { encodeFrames } from '../services/qrTransport';
import { space, type } from '../utils/theme';
import { Button, Row, Segmented } from './ui';

const SPEEDS = { steady: 900, fast: 450 } as const;
type Speed = keyof typeof SPEEDS;

/** Shows one code for small payloads, and a looping sequence for large ones. */
export function AnimatedQr({ payload }: { payload: string }) {
  const frames = useMemo(() => encodeFrames(payload), [payload]);
  const { width, height } = useWindowDimensions();
  const size = Math.min(width - space.xxl * 2, height * 0.55, 460);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<Speed>('steady');
  const isSequence = frames.length > 1;

  useEffect(() => {
    if (!isSequence || paused) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % frames.length), SPEEDS[speed]);
    return () => clearInterval(timer);
  }, [frames.length, isSequence, paused, speed]);

  const step = (delta: number) => {
    setPaused(true);
    setIndex((current) => (current + delta + frames.length) % frames.length);
  };

  return (
    <View style={styles.wrap}>
      {/* The white margin is the quiet zone scanners need on a dark screen. */}
      <View style={styles.quietZone} accessibilityLabel="QR code" accessibilityRole="image">
        <QRCode value={frames[index]} size={size} ecl="M" quietZone={0} backgroundColor="#FFFFFF" color="#000000" />
      </View>
      {isSequence ? (
        <>
          <Text style={type.label} accessibilityLiveRegion="none">
            Part {index + 1} of {frames.length}
          </Text>
          <Text style={[type.note, styles.center]}>
            Keep the scanner pointed at this screen until all parts are read.
          </Text>
          <View style={styles.speed}>
            <Segmented
              value={speed}
              onChange={setSpeed}
              options={[
                { label: 'Steady', value: 'steady' },
                { label: 'Fast', value: 'fast' },
              ]}
            />
          </View>
          <Row>
            <Button label="Previous" tone="quiet" onPress={() => step(-1)} />
            <Button label={paused ? 'Play' : 'Pause'} tone="quiet" onPress={() => setPaused((value) => !value)} />
            <Button label="Next" tone="quiet" onPress={() => step(1)} />
          </Row>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md },
  quietZone: { backgroundColor: '#FFFFFF', padding: space.lg, borderRadius: 8 },
  center: { textAlign: 'center' },
  speed: { alignSelf: 'stretch' },
});
