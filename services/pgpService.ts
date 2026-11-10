/**
 * The only module that talks to OpenPGP.js.
 *
 * Passphrases arrive as arguments, are used once and are never stored, logged
 * or placed in an error message. Unlocked key material is wiped in `finally`.
 */
import * as openpgp from 'openpgp';

openpgp.config.showVersion = false;
openpgp.config.showComment = false;
// Argon2 needs WebAssembly, which Hermes does not provide.
openpgp.config.s2kType = openpgp.enums.s2k.iterated;
openpgp.config.preferredSymmetricAlgorithm = openpgp.enums.symmetric.aes256;
openpgp.config.preferredHashAlgorithm = openpgp.enums.hash.sha512;
// v4 keys and SEIPDv1 remain the formats every GnuPG install can read.
openpgp.config.v6Keys = false;
openpgp.config.aeadProtect = false;

/**
 * Hermes ignores Symbol.species, so Array methods inherited by PacketList return
 * plain arrays. OpenPGP.js then calls PacketList methods on the result, which
 * breaks verification of signed messages.
 */
function restorePacketListSpecies(): void {
  const proto = openpgp.PacketList.prototype as unknown as Record<'concat' | 'slice' | 'filter', unknown>;
  const rebuild = (items: unknown[]) => {
    const list = new openpgp.PacketList();
    Array.prototype.push.apply(list, items);
    return list;
  };
  proto.concat = function concat(this: unknown[], ...values: unknown[]) {
    return rebuild(Array.prototype.concat.apply(Array.from(this), values));
  };
  proto.slice = function slice(this: unknown[], start?: number, end?: number) {
    return rebuild(Array.prototype.slice.call(this, start, end));
  };
  proto.filter = function filter(this: unknown[], predicate: (value: unknown, index: number, array: unknown[]) => boolean) {
    return rebuild(Array.from(this).filter(predicate));
  };
}

restorePacketListSpecies();

export const MIN_PASSPHRASE_LENGTH = 12;
export const FINGERPRINT_URI_PREFIX = 'OPENPGP4FPR:';

export type KeyAlgorithmChoice = 'ed25519' | 'rsa4096';

export type PgpErrorCode =
  | 'WRONG_PASSPHRASE'
  | 'WEAK_PASSPHRASE'
  | 'MALFORMED_INPUT'
  | 'NO_MATCHING_KEY'
  | 'UNUSABLE_RECIPIENT'
  | 'UNSUPPORTED_KEY_PROTECTION'
  | 'DECRYPTION_FAILED'
  | 'INVALID_INPUT';

export class PgpError extends Error {
  constructor(
    readonly code: PgpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PgpError';
  }
}

export interface KeyInfo {
  fingerprint: string;
  keyId: string;
  /** Hex IDs of the primary key and every subkey, used to match message recipients. */
  allKeyIds: string[];
  userIds: string[];
  primaryUserId: string;
  name: string;
  email: string;
  createdAt: string;
  /** ISO date, or null when the key never expires. */
  expiresAt: string | null;
  algorithm: string;
  isPrivate: boolean;
  isRevoked: boolean;
  canEncrypt: boolean;
  canSign: boolean;
}

export interface ParsedKey {
  info: KeyInfo;
  armoredPublic: string;
  armoredPrivate: string | null;
  /** True when a private key has no passphrase and must be given one before storage. */
  isUnprotected: boolean;
}

export interface GeneratedKey extends ParsedKey {
  armoredPrivate: string;
  revocationCertificate: string;
}

export type SignatureStatus =
  | { state: 'none' }
  | { state: 'valid'; keyId: string; signer: KeyInfo | null }
  | { state: 'unknown'; keyId: string }
  | { state: 'invalid'; keyId: string };

export interface DecryptionResult {
  text: string;
  signature: SignatureStatus;
}

export interface MessageRecipients {
  keyIds: string[];
  /** True when the sender hid recipients, so every private key is a candidate. */
  isAnonymous: boolean;
}

const WILDCARD_KEY_ID = '0000000000000000';
const ARMORED_KEY_BLOCK = /-----BEGIN PGP (?:PUBLIC|PRIVATE) KEY BLOCK-----[\s\S]*?-----END PGP (?:PUBLIC|PRIVATE) KEY BLOCK-----/g;

function normaliseFingerprint(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

function describeAlgorithm(info: openpgp.AlgorithmInfo): string {
  if (info.algorithm.startsWith('rsa')) return `RSA ${info.bits ?? ''}`.trim();
  if (info.curve) return info.curve.replace('Legacy', '');
  return String(info.algorithm);
}

function splitUserId(userId: string): { name: string; email: string } {
  const match = /^(.*?)\s*<([^>]*)>\s*$/.exec(userId);
  return match ? { name: match[1].trim(), email: match[2].trim() } : { name: userId.trim(), email: '' };
}

function wrapUnlockError(error: unknown): PgpError {
  const message = error instanceof Error ? error.message : '';
  if (/WebAssembly|argon2/i.test(message)) {
    return new PgpError(
      'UNSUPPORTED_KEY_PROTECTION',
      'This key uses Argon2 passphrase protection, which this device cannot run. Re-export it with iterated S2K protection.',
    );
  }
  if (/passphrase|checksum|session key|MDC|integrity/i.test(message)) {
    return new PgpError('WRONG_PASSPHRASE', 'That passphrase does not unlock this key.');
  }
  return new PgpError('INVALID_INPUT', 'This private key could not be unlocked.');
}

/** Present at runtime on PrivateKey but missing from the published type declarations. */
function wipe(key: openpgp.PrivateKey): void {
  (key as unknown as { clearPrivateParams(): void }).clearPrivateParams();
}

async function resolves(check: Promise<unknown>): Promise<boolean> {
  try {
    await check;
    return true;
  } catch {
    return false;
  }
}

export async function describeKey(key: openpgp.Key): Promise<KeyInfo> {
  const userIds = key.getUserIDs();
  const primaryUserId = await key
    .getPrimaryUser()
    .then(({ user }) => user.userID?.userID ?? userIds[0] ?? '')
    .catch(() => userIds[0] ?? '');
  const { name, email } = splitUserId(primaryUserId);
  const expiration = await key.getExpirationTime().catch(() => null);
  return {
    fingerprint: key.getFingerprint().toUpperCase(),
    keyId: key.getKeyID().toHex().toUpperCase(),
    allKeyIds: key.getKeyIDs().map((id) => id.toHex().toUpperCase()),
    userIds,
    primaryUserId,
    name,
    email,
    createdAt: key.getCreationTime().toISOString(),
    expiresAt: expiration instanceof Date ? expiration.toISOString() : null,
    algorithm: describeAlgorithm(key.getAlgorithmInfo()),
    isPrivate: key.isPrivate(),
    isRevoked: await key.isRevoked(),
    canEncrypt: await resolves(key.getEncryptionKey()),
    canSign: key.isPrivate() ? await resolves((key as openpgp.PrivateKey).getSigningKey()) : false,
  };
}

async function toParsedKey(key: openpgp.Key): Promise<ParsedKey> {
  const isPrivate = key.isPrivate();
  return {
    info: await describeKey(key),
    armoredPublic: key.toPublic().armor(),
    armoredPrivate: isPrivate ? key.armor() : null,
    isUnprotected: isPrivate && (key as openpgp.PrivateKey).isDecrypted(),
  };
}

export function validatePassphrase(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new PgpError('WEAK_PASSPHRASE', `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
}

export async function generateKeyPair(options: {
  name: string;
  email: string;
  passphrase: string;
  algorithm: KeyAlgorithmChoice;
  /** Whole days until expiry. Zero means the key never expires. */
  expiresInDays: number;
}): Promise<GeneratedKey> {
  const name = options.name.trim();
  const email = options.email.trim();
  if (!name) throw new PgpError('INVALID_INPUT', 'Enter a name for this key.');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new PgpError('INVALID_INPUT', 'Enter a valid email address.');
  }
  validatePassphrase(options.passphrase);

  const shared = {
    userIDs: [{ name, email }],
    passphrase: options.passphrase,
    keyExpirationTime: Math.max(0, options.expiresInDays) * 86400,
    format: 'armored' as const,
  };
  const generated =
    options.algorithm === 'rsa4096'
      ? await openpgp.generateKey({ ...shared, type: 'rsa', rsaBits: 4096 })
      : await openpgp.generateKey({ ...shared, type: 'ecc', curve: 'ed25519Legacy' });

  const key = await openpgp.readPrivateKey({ armoredKey: generated.privateKey });
  const parsed = await toParsedKey(key);
  return {
    ...parsed,
    armoredPrivate: generated.privateKey,
    armoredPublic: generated.publicKey,
    isUnprotected: false,
    revocationCertificate: generated.revocationCertificate,
  };
}

/** Accepts armored text or binary key material, possibly containing several keys. */
export async function parseKeys(input: string | Uint8Array): Promise<ParsedKey[]> {
  let keys: openpgp.Key[];
  try {
    if (typeof input === 'string') {
      // readKeys stops after one armored block, so several pasted blocks are read separately.
      const blocks = input.match(ARMORED_KEY_BLOCK) ?? [input.trim()];
      keys = (await Promise.all(blocks.map((armoredKeys) => openpgp.readKeys({ armoredKeys })))).flat();
    } else {
      keys = await openpgp.readKeys({ binaryKeys: input });
    }
  } catch {
    throw new PgpError('MALFORMED_INPUT', 'No valid OpenPGP key was found in this data.');
  }
  return Promise.all(keys.map(toParsedKey));
}

export function looksLikeKeyBlock(text: string): boolean {
  return /-----BEGIN PGP (PUBLIC|PRIVATE) KEY BLOCK-----/.test(text);
}

export function looksLikeMessage(text: string): boolean {
  return /-----BEGIN PGP MESSAGE-----/.test(text);
}

/** Adds a passphrase to an imported key that has none. */
export async function protectPrivateKey(armoredKey: string, passphrase: string): Promise<string> {
  validatePassphrase(passphrase);
  const privateKey = await openpgp.readPrivateKey({ armoredKey });
  if (!privateKey.isDecrypted()) return armoredKey;
  const encrypted = await openpgp.encryptKey({ privateKey, passphrase });
  const armored = encrypted.armor();
  wipe(encrypted);
  wipe(privateKey);
  return armored;
}

async function withUnlockedKey<T>(
  armoredKey: string,
  passphrase: string,
  action: (key: openpgp.PrivateKey) => Promise<T>,
): Promise<T> {
  let unlocked: openpgp.PrivateKey;
  try {
    const privateKey = await openpgp.readPrivateKey({ armoredKey });
    unlocked = privateKey.isDecrypted() ? privateKey : await openpgp.decryptKey({ privateKey, passphrase });
  } catch (error) {
    throw wrapUnlockError(error);
  }
  try {
    return await action(unlocked);
  } finally {
    wipe(unlocked);
  }
}

/** Confirms a passphrase before a sensitive action such as exporting a private key. */
export async function verifyPassphrase(armoredKey: string, passphrase: string): Promise<void> {
  await withUnlockedKey(armoredKey, passphrase, async () => undefined);
}

export async function encryptText(options: {
  text: string;
  recipientPublicKeys: string[];
  signer?: { armoredPrivate: string; passphrase: string };
}): Promise<string> {
  if (!options.text) throw new PgpError('INVALID_INPUT', 'Enter some text to encrypt.');
  if (options.recipientPublicKeys.length === 0) {
    throw new PgpError('INVALID_INPUT', 'Choose at least one recipient.');
  }

  const encryptionKeys = await Promise.all(
    options.recipientPublicKeys.map((armoredKey) => openpgp.readKey({ armoredKey })),
  );
  const message = await openpgp.createMessage({ text: options.text });

  const run = async (signingKeys?: openpgp.PrivateKey): Promise<string> => {
    try {
      return await openpgp.encrypt({ message, encryptionKeys, signingKeys, format: 'armored' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      if (/expired|revoked|encryption key|Could not find valid/i.test(detail)) {
        throw new PgpError('UNUSABLE_RECIPIENT', 'A chosen key is expired, revoked or cannot encrypt.');
      }
      throw new PgpError('INVALID_INPUT', 'This text could not be encrypted.');
    }
  };

  if (!options.signer) return run();
  return withUnlockedKey(options.signer.armoredPrivate, options.signer.passphrase, run);
}

export async function readMessageRecipients(armoredMessage: string): Promise<MessageRecipients> {
  let message: openpgp.Message<string>;
  try {
    message = await openpgp.readMessage({ armoredMessage: armoredMessage.trim() });
  } catch {
    throw new PgpError('MALFORMED_INPUT', 'This is not a valid PGP message.');
  }
  const ids = message.getEncryptionKeyIDs().map((id) => id.toHex().toUpperCase());
  return {
    keyIds: ids.filter((id) => id !== WILDCARD_KEY_ID),
    isAnonymous: ids.includes(WILDCARD_KEY_ID),
  };
}

async function readSignature(
  signatures: openpgp.DecryptMessageResult['signatures'],
  knownKeys: openpgp.Key[],
): Promise<SignatureStatus> {
  if (signatures.length === 0) return { state: 'none' };
  // A message is reported as signed by the first signature that verifies.
  let fallback: SignatureStatus = { state: 'invalid', keyId: signatures[0].keyID.toHex().toUpperCase() };
  for (const signature of signatures) {
    const keyId = signature.keyID.toHex().toUpperCase();
    const known = knownKeys.find((key) => key.getKeyIDs().some((id) => id.toHex().toUpperCase() === keyId));
    if (!known) {
      // Without the signer's key the promise can only reject; never consume it as a result.
      await signature.verified.catch(() => undefined);
      fallback = { state: 'unknown', keyId };
      continue;
    }
    try {
      await signature.verified;
      return { state: 'valid', keyId, signer: await describeKey(known) };
    } catch {
      return { state: 'invalid', keyId };
    }
  }
  return fallback;
}

export async function decryptText(options: {
  armoredMessage: string;
  armoredPrivate: string;
  passphrase: string;
  /** Armored public keys from the keyring, used to verify signatures. */
  verificationKeys: string[];
}): Promise<DecryptionResult> {
  const verificationKeys = await Promise.all(
    options.verificationKeys.map((armoredKey) => openpgp.readKey({ armoredKey })),
  );
  return withUnlockedKey(options.armoredPrivate, options.passphrase, async (decryptionKey) => {
    try {
      const message = await openpgp.readMessage({ armoredMessage: options.armoredMessage.trim() });
      const result = await openpgp.decrypt({
        message,
        decryptionKeys: decryptionKey,
        verificationKeys,
        format: 'utf8',
      });
      return {
        text: result.data,
        signature: await readSignature(result.signatures, verificationKeys),
      };
    } catch {
      throw new PgpError('DECRYPTION_FAILED', 'This message could not be decrypted with the selected key.');
    }
  });
}

export type RevocationReason = 'compromised' | 'superseded' | 'retired';

const REVOCATION_FLAGS: Record<RevocationReason, openpgp.enums.reasonForRevocation> = {
  compromised: openpgp.enums.reasonForRevocation.keyCompromised,
  superseded: openpgp.enums.reasonForRevocation.keySuperseded,
  retired: openpgp.enums.reasonForRevocation.keyRetired,
};

/** Returns the revoked key. The private half stays protected by the same passphrase. */
export async function revokeKey(options: {
  armoredPrivate: string;
  passphrase: string;
  reason: RevocationReason;
}): Promise<ParsedKey> {
  return withUnlockedKey(options.armoredPrivate, options.passphrase, async (key) => {
    const { privateKey } = await openpgp.revokeKey({
      key,
      reasonForRevocation: { flag: REVOCATION_FLAGS[options.reason] },
      format: 'object',
    });
    const encrypted = await openpgp.encryptKey({ privateKey, passphrase: options.passphrase });
    const parsed = await toParsedKey(encrypted);
    wipe(encrypted);
    wipe(privateKey);
    return parsed;
  });
}

/**
 * Merges new signatures, user IDs and subkeys into a key already held. OpenPGP.js
 * drops anything not signed by the primary key, and a held private key stays private.
 */
export async function mergeKeys(existingArmored: string, incomingArmored: string): Promise<ParsedKey> {
  const existing = await openpgp.readKey({ armoredKey: existingArmored });
  const incoming = await openpgp.readKey({ armoredKey: incomingArmored });
  if (existing.getFingerprint() !== incoming.getFingerprint()) {
    throw new PgpError('INVALID_INPUT', 'These keys have different fingerprints.');
  }
  return toParsedKey(await existing.update(incoming));
}

/**
 * Exercises the native crypto provider end to end, in memory, on this device.
 * Returns the elapsed milliseconds for each algorithm.
 */
export async function runSelfTest(): Promise<{ ed25519Ms: number; rsa4096Ms: number }> {
  const known = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc')));
  const hex = Array.from(known, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') {
    throw new Error('SHA-256 returned an incorrect result.');
  }
  const passphrase = 'self-test passphrase';
  const roundTrip = async (algorithm: KeyAlgorithmChoice): Promise<number> => {
    const started = Date.now();
    const key = await generateKeyPair({ name: 'Self Test', email: 'self-test@example.invalid', passphrase, algorithm, expiresInDays: 0 });
    const signer = { armoredPrivate: key.armoredPrivate, passphrase };
    const sealed = await encryptText({ text: 'Καλημέρα', recipientPublicKeys: [key.armoredPublic], signer });
    const opened = await decryptText({
      armoredMessage: sealed,
      armoredPrivate: key.armoredPrivate,
      passphrase,
      verificationKeys: [key.armoredPublic],
    });
    if (opened.text !== 'Καλημέρα' || opened.signature.state !== 'valid') {
      throw new Error(`The ${algorithm} round trip failed.`);
    }
    return Date.now() - started;
  };
  return { ed25519Ms: await roundTrip('ed25519'), rsa4096Ms: await roundTrip('rsa4096') };
}

/** Compact verification payload, compatible with OpenKeychain and Delta Chat. */
export function toFingerprintUri(fingerprint: string): string {
  return `${FINGERPRINT_URI_PREFIX}${normaliseFingerprint(fingerprint)}`;
}

export function parseFingerprintUri(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.toUpperCase().startsWith(FINGERPRINT_URI_PREFIX)) return null;
  const fingerprint = normaliseFingerprint(trimmed.slice(FINGERPRINT_URI_PREFIX.length).split('#')[0]);
  return fingerprint.length === 40 || fingerprint.length === 64 ? fingerprint : null;
}
