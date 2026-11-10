/**
 * Behavioural suite for the crypto, vault and QR layers.
 * Runs unchanged on Node and on a bare Hermes VM, which has no WebCrypto.
 */
import * as pgp from '../services/pgpService';
import { FrameAssembler, encodeFrames, SINGLE_QR_LIMIT } from '../services/qrTransport';
import { Vault, VaultUnreadableError, type BlobStore, type SecretStore } from '../services/vault';

type Log = (line: string) => void;

const PASS = 'correct horse battery staple';

function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(`Assertion failed: ${label}`);
}

async function rejects(run: () => Promise<unknown>, code: pgp.PgpErrorCode, label: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    check(error instanceof pgp.PgpError && error.code === code, `${label}: got ${String(error)}`);
    return;
  }
  throw new Error(`Expected rejection: ${label}`);
}

function memoryStores() {
  const map = new Map<string, string>();
  const state: { blob: Uint8Array | null } = { blob: null };
  const secrets: SecretStore = {
    get: async (name) => map.get(name) ?? null,
    set: async (name, value) => void map.set(name, value),
    remove: async (name) => void map.delete(name),
  };
  const blobs: BlobStore = {
    read: async () => state.blob,
    write: async (bytes) => void (state.blob = bytes),
    remove: async () => void (state.blob = null),
  };
  return { map, state, secrets, blobs };
}

export async function runSuite(
  log: Log,
  now: () => number,
  options: { rsa: boolean; randomBytes: (length: number) => Uint8Array },
): Promise<void> {
  const timed = async <T,>(label: string, run: () => Promise<T>): Promise<T> => {
    const start = now();
    const value = await run();
    log(`ok  ${label} (${Math.round(now() - start)} ms)`);
    return value;
  };

  const alice = await timed('generate Ed25519/X25519 key', () =>
    pgp.generateKeyPair({ name: 'Alice', email: 'alice@example.org', passphrase: PASS, algorithm: 'ed25519', expiresInDays: 365 }),
  );
  const bob = await timed('generate second key', () =>
    pgp.generateKeyPair({ name: 'Bob', email: 'bob@example.org', passphrase: PASS, algorithm: 'ed25519', expiresInDays: 0 }),
  );
  check(alice.info.canEncrypt && alice.info.canSign, 'alice capabilities');
  check(alice.info.expiresAt !== null && bob.info.expiresAt === null, 'expiry');
  check(alice.info.fingerprint.length === 40, 'fingerprint length');
  check(!alice.armoredPublic.includes('Version:') && !alice.armoredPublic.includes('Comment:'), 'no armor metadata');
  check(alice.armoredPublic.includes('PUBLIC KEY BLOCK'), 'public armor');

  await rejects(
    () => pgp.generateKeyPair({ name: 'A', email: 'a@b.co', passphrase: 'short', algorithm: 'ed25519', expiresInDays: 0 }),
    'WEAK_PASSPHRASE',
    'weak passphrase',
  );
  await rejects(() => pgp.verifyPassphrase(alice.armoredPrivate, 'wrong passphrase!!'), 'WRONG_PASSPHRASE', 'wrong passphrase');
  await timed('unlock with passphrase', () => pgp.verifyPassphrase(alice.armoredPrivate, PASS));

  const unicode = 'Καλημέρα κόσμε 🌬️ — signed and sealed';
  const sealed = await timed('encrypt and sign', () =>
    pgp.encryptText({
      text: unicode,
      recipientPublicKeys: [bob.armoredPublic],
      signer: { armoredPrivate: alice.armoredPrivate, passphrase: PASS },
    }),
  );
  check(pgp.looksLikeMessage(sealed), 'message armor');
  const recipients = await pgp.readMessageRecipients(sealed);
  check(recipients.keyIds.some((id) => bob.info.allKeyIds.includes(id)), 'recipient matches subkey');
  check(!recipients.isAnonymous, 'not anonymous');

  const opened = await timed('decrypt and verify', () =>
    pgp.decryptText({ armoredMessage: sealed, armoredPrivate: bob.armoredPrivate, passphrase: PASS, verificationKeys: [alice.armoredPublic, bob.armoredPublic] }),
  );
  check(opened.text === unicode, 'round trip');
  check(opened.signature.state === 'valid' && opened.signature.signer?.fingerprint === alice.info.fingerprint, 'valid signature');

  const unknown = await pgp.decryptText({ armoredMessage: sealed, armoredPrivate: bob.armoredPrivate, passphrase: PASS, verificationKeys: [bob.armoredPublic] });
  check(unknown.signature.state === 'unknown', 'unknown signer');

  const unsigned = await pgp.encryptText({ text: 'plain', recipientPublicKeys: [bob.armoredPublic] });
  const unsignedOpen = await pgp.decryptText({ armoredMessage: unsigned, armoredPrivate: bob.armoredPrivate, passphrase: PASS, verificationKeys: [alice.armoredPublic] });
  check(unsignedOpen.signature.state === 'none', 'no signature');

  await rejects(() => pgp.decryptText({ armoredMessage: sealed, armoredPrivate: alice.armoredPrivate, passphrase: PASS, verificationKeys: [] }), 'DECRYPTION_FAILED', 'wrong recipient');
  await rejects(() => pgp.readMessageRecipients('not a message'), 'MALFORMED_INPUT', 'malformed message');
  await rejects(() => pgp.parseKeys('garbage'), 'MALFORMED_INPUT', 'malformed key');

  const lines = sealed.split('\n');
  const target = lines.findIndex((line, index) => index > 2 && line.length > 40);
  const swapped = lines[target][10] === 'A' ? 'B' : 'A';
  lines[target] = `${lines[target].slice(0, 10)}${swapped}${lines[target].slice(11)}`;
  await rejects(() => pgp.decryptText({ armoredMessage: lines.join('\n'), armoredPrivate: bob.armoredPrivate, passphrase: PASS, verificationKeys: [alice.armoredPublic] }), 'DECRYPTION_FAILED', 'tampered ciphertext');
  log('ok  tampered ciphertext rejected');

  const [parsedPublic] = await pgp.parseKeys(alice.armoredPublic);
  check(!parsedPublic.info.isPrivate && parsedPublic.armoredPrivate === null, 'public import');
  const [parsedPrivate] = await pgp.parseKeys(alice.armoredPrivate);
  check(parsedPrivate.info.isPrivate && !parsedPrivate.isUnprotected, 'private import stays locked');
  const multi = await pgp.parseKeys(`${alice.armoredPublic}\n${bob.armoredPublic}`);
  check(multi.length === 2, 'multi-key import');
  log('ok  multi-key armored import');

  const merged = await pgp.mergeKeys(alice.armoredPrivate, alice.armoredPublic);
  check(merged.armoredPrivate !== null && !merged.isUnprotected, 'merge keeps private half locked');
  log('ok  merge keeps private key');

  const revoked = await timed('revoke key', () => pgp.revokeKey({ armoredPrivate: bob.armoredPrivate, passphrase: PASS, reason: 'retired' }));
  check(revoked.info.isRevoked, 'revoked flag');
  check(!revoked.isUnprotected, 'revoked private key stays encrypted');
  await rejects(() => pgp.verifyPassphrase(revoked.armoredPrivate as string, 'wrong passphrase!!'), 'WRONG_PASSPHRASE', 'revoked key still locked');
  await rejects(() => pgp.encryptText({ text: 'x', recipientPublicKeys: [revoked.armoredPublic] }), 'UNUSABLE_RECIPIENT', 'revoked recipient refused');

  const uri = pgp.toFingerprintUri(alice.info.fingerprint);
  check(pgp.parseFingerprintUri(uri) === alice.info.fingerprint, 'fingerprint uri');
  check(pgp.parseFingerprintUri(`${uri}#a=x`) === alice.info.fingerprint, 'fingerprint uri fragment');
  check(pgp.parseFingerprintUri('OPENPGP4FPR:1234') === null, 'short fingerprint rejected');

  check(encodeFrames('short').length === 1, 'single frame');
  const large = 'x'.repeat(SINGLE_QR_LIMIT) + 'Ω'.repeat(2400);
  const frames = encodeFrames(large);
  const assembler = new FrameAssembler();
  let final = assembler.add(frames[frames.length - 1]);
  for (const frame of [...frames].reverse()) final = assembler.add(frame);
  check(final.status === 'complete' && final.payload === large, 'out of order assembly');
  const corrupted = frames.map((frame) => frame.replace(/x/, 'y'));
  let bad = assembler.add(corrupted[0]);
  for (const frame of corrupted.slice(1)) bad = assembler.add(frame);
  check(bad.status === 'failed', 'corrupt frames fail digest');
  check(assembler.add('hello').status === 'ignored', 'non-frame ignored');
  check(assembler.add('SFG1:0123456789abcdef:9/2:zz').status === 'ignored', 'index beyond total ignored');
  log(`ok  QR frames (${frames.length}) reassemble and reject corruption`);

  const stores = memoryStores();
  const vault = new Vault(stores.secrets, stores.blobs, options.randomBytes);
  await vault.open();
  const record = {
    info: alice.info,
    armoredPublic: alice.armoredPublic,
    armoredPrivate: alice.armoredPrivate,
    revocationCertificate: alice.revocationCertificate,
    trust: 'own' as const,
    addedAt: new Date(0).toISOString(),
  };
  await vault.put(record);
  const sealedBlob = stores.state.blob as Uint8Array;
  const blobText = Array.from(sealedBlob, (byte) => String.fromCharCode(byte)).join('');
  check(!blobText.includes('PGP') && !blobText.includes('alice@'), 'vault blob is opaque');

  const reopened = new Vault(stores.secrets, stores.blobs, options.randomBytes);
  const loaded = await reopened.open();
  check(loaded.length === 1 && loaded[0].armoredPrivate === alice.armoredPrivate, 'vault reload');

  const flipped = sealedBlob.slice();
  flipped[flipped.length - 1] ^= 1;
  stores.state.blob = flipped;
  let tamperCaught = false;
  await new Vault(stores.secrets, stores.blobs, options.randomBytes).open().catch((error) => {
    tamperCaught = error instanceof VaultUnreadableError;
  });
  check(tamperCaught, 'tampered vault detected');
  stores.state.blob = sealedBlob;

  stores.map.clear();
  let missingCaught = false;
  await new Vault(stores.secrets, stores.blobs, options.randomBytes).open().catch((error) => {
    missingCaught = error instanceof VaultUnreadableError;
  });
  check(missingCaught && stores.state.blob === sealedBlob, 'missing master key reported, blob preserved');
  log('ok  vault encrypts, reloads and fails closed');

  if (options.rsa) {
    const rsa = await timed('generate RSA 4096 key', () =>
      pgp.generateKeyPair({ name: 'Rsa', email: 'rsa@example.org', passphrase: PASS, algorithm: 'rsa4096', expiresInDays: 0 }),
    );
    check(rsa.info.algorithm === 'RSA 4096', `rsa bits: ${rsa.info.algorithm}`);
    log(`ok  RSA armored sizes: public ${rsa.armoredPublic.length}, private ${rsa.armoredPrivate.length}`);
    const rsaMessage = await timed('RSA encrypt', () => pgp.encryptText({ text: 'rsa', recipientPublicKeys: [rsa.armoredPublic] }));
    const rsaOpen = await timed('RSA decrypt', () =>
      pgp.decryptText({ armoredMessage: rsaMessage, armoredPrivate: rsa.armoredPrivate, passphrase: PASS, verificationKeys: [] }),
    );
    check(rsaOpen.text === 'rsa', 'rsa round trip');
    log(`ok  RSA public key needs ${encodeFrames(rsa.armoredPublic).length} QR frames`);
  }

  log('SUITE PASSED');
}
