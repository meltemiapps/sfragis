import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import * as pgp from './pgpService';
import { VaultUnreadableError, type KeyRecord, type KeyTrust } from './vault';
import { createDeviceVault } from './vaultStorage';

export interface ImportOutcome {
  record: KeyRecord;
  wasKnown: boolean;
}

interface KeyringValue {
  status: 'loading' | 'ready' | 'unreadable';
  statusMessage: string | null;
  keys: KeyRecord[];
  getKey: (fingerprint: string) => KeyRecord | undefined;
  addGenerated: (key: pgp.GeneratedKey) => Promise<KeyRecord>;
  importParsed: (parsed: pgp.ParsedKey) => Promise<ImportOutcome>;
  applyUpdate: (fingerprint: string, parsed: pgp.ParsedKey) => Promise<void>;
  setTrust: (fingerprint: string, trust: KeyTrust) => Promise<void>;
  removeKey: (fingerprint: string) => Promise<void>;
  eraseAll: () => Promise<void>;
  retry: () => void;
  /** Hands a scanned message or a result to the screen that will show it. */
  stagedMessage: { id: number; text: string } | null;
  stageMessage: (text: string) => void;
  /** Held in memory only, for the QR screen to display. */
  qrPayload: string | null;
  setQrPayload: (payload: string | null) => void;
}

const KeyringContext = createContext<KeyringValue | null>(null);

export function KeyringProvider({ children }: { children: ReactNode }) {
  const vaultRef = useRef(createDeviceVault());
  const [status, setStatus] = useState<KeyringValue['status']>('loading');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [stagedMessage, setStagedMessage] = useState<KeyringValue['stagedMessage']>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);

  const open = useCallback(async () => {
    try {
      const records = await vaultRef.current.open();
      setKeys(records);
      setStatusMessage(null);
      setStatus('ready');
    } catch (error) {
      setStatusMessage(
        error instanceof VaultUnreadableError ? error.message : 'The keyring could not be opened on this device.',
      );
      setStatus('unreadable');
    }
  }, []);

  useEffect(() => {
    void open();
  }, [open]);

  const refresh = useCallback(() => setKeys(vaultRef.current.list()), []);

  const value = useMemo<KeyringValue>(() => {
    const vault = vaultRef.current;
    return {
      status,
      statusMessage,
      keys,
      getKey: (fingerprint) => keys.find((key) => key.info.fingerprint === fingerprint),
      addGenerated: async (key) => {
        const record: KeyRecord = {
          info: key.info,
          armoredPublic: key.armoredPublic,
          armoredPrivate: key.armoredPrivate,
          revocationCertificate: key.revocationCertificate,
          trust: 'own',
          addedAt: new Date().toISOString(),
        };
        await vault.put(record);
        refresh();
        return record;
      },
      importParsed: async (parsed) => {
        const existing = vault.get(parsed.info.fingerprint);
        if (!existing) {
          const record: KeyRecord = {
            info: parsed.info,
            armoredPublic: parsed.armoredPublic,
            armoredPrivate: parsed.armoredPrivate,
            revocationCertificate: null,
            trust: parsed.armoredPrivate ? 'own' : 'unverified',
            addedAt: new Date().toISOString(),
          };
          await vault.put(record);
          refresh();
          return { record, wasKnown: false };
        }
        const base = existing.armoredPrivate ?? existing.armoredPublic;
        const merged = await pgp.mergeKeys(base, parsed.armoredPrivate ?? parsed.armoredPublic);
        let record = await vault.applyParsedUpdate(existing.info.fingerprint, merged);
        if (record.armoredPrivate && record.trust !== 'own') {
          record = { ...record, trust: 'own' };
          await vault.put(record);
        }
        refresh();
        return { record, wasKnown: true };
      },
      applyUpdate: async (fingerprint, parsed) => {
        await vault.applyParsedUpdate(fingerprint, parsed);
        refresh();
      },
      setTrust: async (fingerprint, trust) => {
        await vault.setTrust(fingerprint, trust);
        refresh();
      },
      removeKey: async (fingerprint) => {
        await vault.remove(fingerprint);
        refresh();
      },
      eraseAll: async () => {
        await vault.erase();
        await open();
      },
      retry: () => {
        setStatus('loading');
        void open();
      },
      stagedMessage,
      stageMessage: (text) => setStagedMessage((current) => ({ id: (current?.id ?? 0) + 1, text })),
      qrPayload,
      setQrPayload,
    };
  }, [status, statusMessage, keys, stagedMessage, qrPayload, open, refresh]);

  return <KeyringContext.Provider value={value}>{children}</KeyringContext.Provider>;
}

export function useKeyring(): KeyringValue {
  const value = useContext(KeyringContext);
  if (!value) throw new Error('useKeyring must be used inside KeyringProvider.');
  return value;
}
