import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { PgpError } from '../services/pgpService';
import { errorMessage, nextPaint } from '../utils/format';
import { glass, space, type } from '../utils/theme';
import { GlassSurface } from './Glass';
import { Button, PassphraseField, Row, useLargeText } from './ui';

interface Request {
  title: string;
  detail: string;
  actionLabel: string;
  run: (passphrase: string) => Promise<unknown>;
  settle: (result: { value?: unknown; cancelled: boolean; error?: unknown }) => void;
}

export interface PassphraseOptions {
  title: string;
  detail: string;
  actionLabel: string;
}

export type WithPassphrase = <T>(
  options: PassphraseOptions,
  action: (passphrase: string) => Promise<T>,
) => Promise<{ cancelled: true } | { cancelled: false; value: T }>;

const PassphraseContext = createContext<WithPassphrase | null>(null);

/**
 * One modal for every operation that needs a key unlocked. The passphrase lives
 * in this component's state for the length of the prompt and is cleared on close.
 */
export function PassphraseProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const largeText = useLargeText();
  const activeRef = useRef<Request | null>(null);

  const close = useCallback(() => {
    activeRef.current = null;
    setRequest(null);
    setPassphrase('');
    setProblem(null);
    setBusy(false);
  }, []);

  const withPassphrase = useCallback<WithPassphrase>(
    (options, action) =>
      new Promise((resolve, reject) => {
        const next: Request = {
          ...options,
          run: action,
          settle: (result) => {
            if (result.error) reject(result.error);
            else if (result.cancelled) resolve({ cancelled: true });
            else resolve({ cancelled: false, value: result.value as Awaited<ReturnType<typeof action>> });
          },
        };
        activeRef.current = next;
        setRequest(next);
      }),
    [],
  );

  const submit = async () => {
    const active = activeRef.current;
    if (!active || !passphrase) return;
    setBusy(true);
    setProblem(null);
    await nextPaint();
    try {
      const value = await active.run(passphrase);
      close();
      active.settle({ value, cancelled: false });
    } catch (error) {
      if (error instanceof PgpError && error.code === 'WRONG_PASSPHRASE') {
        setProblem(error.message);
        setPassphrase('');
        setBusy(false);
        return;
      }
      close();
      active.settle({ cancelled: false, error: error instanceof Error ? error : new Error(errorMessage(error)) });
    }
  };

  const cancel = () => {
    const active = activeRef.current;
    close();
    active?.settle({ cancelled: true });
  };

  const value = useMemo(() => withPassphrase, [withPassphrase]);

  return (
    <PassphraseContext.Provider value={value}>
      {children}
      <Modal visible={request !== null} transparent animationType="fade" onRequestClose={cancel}>
        {/* A floating glass sheet at the bottom, lifted above the keyboard the field opens. */}
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <GlassSurface radius={glass.radius.sheet} style={styles.sheetSurface}>
            <View style={styles.sheet} accessibilityViewIsModal>
              <Text style={type.heading}>{request?.title}</Text>
              <Text style={type.note}>{request?.detail}</Text>
              <PassphraseField
                label="Key passphrase"
                value={passphrase}
                onChangeText={setPassphrase}
                onSubmitEditing={submit}
                autoFocus
                error={problem}
                editable={!busy}
              />
              <Row>
                <Button label="Cancel" tone="quiet" onPress={cancel} disabled={busy} style={largeText ? undefined : styles.action} testID="passphrase-cancel" />
                <Button
                  label={request?.actionLabel ?? 'Unlock'}
                  onPress={submit}
                  busy={busy}
                  disabled={!passphrase}
                  style={largeText ? undefined : styles.action}
                  testID="passphrase-submit"
                />
              </Row>
            </View>
          </GlassSurface>
        </KeyboardAvoidingView>
      </Modal>
    </PassphraseContext.Provider>
  );
}

export function usePassphrase(): WithPassphrase {
  const value = useContext(PassphraseContext);
  if (!value) throw new Error('usePassphrase must be used inside PassphraseProvider.');
  return value;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 12, 18, 0.55)', justifyContent: 'flex-end', padding: space.sm },
  sheetSurface: { width: '100%', maxWidth: 460, alignSelf: 'center', marginBottom: space.lg },
  sheet: { padding: space.xl, gap: space.md },
  action: { flex: 1 },
});
