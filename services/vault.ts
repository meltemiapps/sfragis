/**
 * Encrypted local keyring.
 *
 * A random 256-bit master key lives in the OS keychain/keystore; the keyring is an
 * XChaCha20-Poly1305 blob on disk. Keychain entries are too small for RSA 4096
 * private keys, so keys cannot be stored there directly. Private keys inside the
 * blob remain protected by their own OpenPGP passphrase as a second layer.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

import type { KeyInfo, ParsedKey } from './pgpService';

export type KeyTrust = 'own' | 'verified' | 'unverified';

export interface KeyRecord {
  info: KeyInfo;
  armoredPublic: string;
  armoredPrivate: string | null;
  revocationCertificate: string | null;
  trust: KeyTrust;
  addedAt: string;
}

export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface BlobStore {
  read(): Promise<Uint8Array | null>;
  write(bytes: Uint8Array): Promise<void>;
  remove(): Promise<void>;
}

export class VaultUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultUnreadableError';
  }
}

const MASTER_KEY_NAME = 'sfragis.vault.master.v1';
const NONCE_LENGTH = 24;
const ASSOCIATED_DATA = new TextEncoder().encode('sfragis-vault-v1');

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new VaultUnreadableError('The keyring master key is damaged.');
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

export class Vault {
  private records: KeyRecord[] = [];
  private masterKey: Uint8Array | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly secrets: SecretStore,
    private readonly blobs: BlobStore,
    private readonly randomBytes: (length: number) => Uint8Array,
  ) {}

  /**
   * Loads the keyring. A blob without its master key is reported, never replaced,
   * so a keychain fault cannot silently destroy recoverable data.
   */
  async open(): Promise<KeyRecord[]> {
    const [storedKey, blob] = await Promise.all([this.secrets.get(MASTER_KEY_NAME), this.blobs.read()]);
    if (!storedKey) {
      if (blob) {
        throw new VaultUnreadableError('The keyring exists but its master key is missing from this device.');
      }
      const created = this.randomBytes(32);
      await this.secrets.set(MASTER_KEY_NAME, toHex(created));
      this.masterKey = created;
      this.records = [];
      return this.list();
    }
    this.masterKey = fromHex(storedKey);
    this.records = blob ? this.decode(blob) : [];
    return this.list();
  }

  list(): KeyRecord[] {
    return [...this.records].sort((a, b) => a.info.name.localeCompare(b.info.name));
  }

  get(fingerprint: string): KeyRecord | undefined {
    return this.records.find((record) => record.info.fingerprint === fingerprint);
  }

  async put(record: KeyRecord): Promise<void> {
    const others = this.records.filter((item) => item.info.fingerprint !== record.info.fingerprint);
    await this.commit([...others, record]);
  }

  async applyParsedUpdate(fingerprint: string, parsed: ParsedKey): Promise<KeyRecord> {
    const current = this.get(fingerprint);
    if (!current) throw new Error('This key is no longer in the keyring.');
    const updated: KeyRecord = {
      ...current,
      info: parsed.info,
      armoredPublic: parsed.armoredPublic,
      armoredPrivate: parsed.armoredPrivate ?? current.armoredPrivate,
    };
    await this.put(updated);
    return updated;
  }

  async setTrust(fingerprint: string, trust: KeyTrust): Promise<void> {
    const current = this.get(fingerprint);
    if (current) await this.put({ ...current, trust });
  }

  async remove(fingerprint: string): Promise<void> {
    await this.commit(this.records.filter((record) => record.info.fingerprint !== fingerprint));
  }

  /** Destroys the keyring and its master key. */
  async erase(): Promise<void> {
    await this.blobs.remove();
    await this.secrets.remove(MASTER_KEY_NAME);
    this.records = [];
    this.masterKey = null;
  }

  private decode(blob: Uint8Array): KeyRecord[] {
    if (!this.masterKey || blob.length <= NONCE_LENGTH) {
      throw new VaultUnreadableError('The keyring file is damaged.');
    }
    try {
      const nonce = blob.slice(0, NONCE_LENGTH);
      const cipher = xchacha20poly1305(this.masterKey, nonce, ASSOCIATED_DATA);
      const plain = cipher.decrypt(blob.slice(NONCE_LENGTH));
      return JSON.parse(new TextDecoder().decode(plain)) as KeyRecord[];
    } catch {
      throw new VaultUnreadableError('The keyring file could not be decrypted on this device.');
    }
  }

  private commit(next: KeyRecord[]): Promise<void> {
    const write = this.writeQueue.then(async () => {
      if (!this.masterKey) throw new VaultUnreadableError('The keyring is not open.');
      const nonce = this.randomBytes(NONCE_LENGTH);
      const cipher = xchacha20poly1305(this.masterKey, nonce, ASSOCIATED_DATA);
      const sealed = cipher.encrypt(new TextEncoder().encode(JSON.stringify(next)));
      const blob = new Uint8Array(nonce.length + sealed.length);
      blob.set(nonce);
      blob.set(sealed, nonce.length);
      await this.blobs.write(blob);
      this.records = next;
    });
    this.writeQueue = write.catch(() => undefined);
    return write;
  }
}
