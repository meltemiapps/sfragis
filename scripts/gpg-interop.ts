/// <reference types="node" />
/**
 * Interoperability check between Sfragis (services/pgpService.ts) and GnuPG.
 *
 * Runs in a throwaway GNUPGHOME that is deleted afterwards, with invented
 * identities and a generated test passphrase. For Ed25519 and RSA 4096 it checks:
 *   - Sfragis public and private keys import into gpg, and gpg's into Sfragis
 *   - Sfragis encrypts and signs, gpg decrypts and verifies
 *   - gpg encrypts and signs, Sfragis decrypts and verifies
 *   - each side decrypts with the private key the other side exported
 *
 * Run: npm run test:gpg   (needs `gpg` 2.2 or later on PATH)
 */
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as pgp from '../services/pgpService';

const MESSAGE = 'Καλημέρα, Νίκο.\nSecond line, with ünïcödé and a trailing newline.\n';

type Algorithm = 'ed25519' | 'rsa4096';

const home = mkdtempSync(join(tmpdir(), 'sfragis-gpg-'));
chmodSync(home, 0o700);
const passphrase = Buffer.from(webcrypto.getRandomValues(new Uint8Array(24))).toString('base64');
const passphraseFile = join(home, 'passphrase');
writeFileSync(passphraseFile, passphrase, { mode: 0o600 });

let failures = 0;

function gpg(args: string[], input?: string): { stdout: string; status: string } {
  const statusFile = join(home, 'status');
  writeFileSync(statusFile, '');
  const stdout = execFileSync(
    'gpg',
    [
      '--homedir', home,
      '--batch', '--yes', '--no-tty', '--quiet',
      '--pinentry-mode', 'loopback', '--passphrase-file', passphraseFile,
      '--trust-model', 'always',
      '--status-file', statusFile,
      ...args,
    ],
    { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const status = execFileSync('cat', [statusFile], { encoding: 'utf8' });
  return { stdout, status };
}

function check(condition: unknown, label: string, detail = ''): void {
  if (condition) {
    console.log(`ok    ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? `\n      ${detail.replace(/\n/g, '\n      ')}` : ''}`);
  }
}

async function attempt(label: string, run: () => Promise<void> | void): Promise<void> {
  try {
    await run();
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    const stderr = (error as { stderr?: Buffer | string }).stderr;
    console.log(`FAIL  ${label}\n      ${message}${stderr ? `\n      ${String(stderr).trim()}` : ''}`);
  }
}

function gpgFingerprint(uid: string): string {
  const listing = gpg(['--with-colons', '--list-keys', uid]).stdout;
  const line = listing.split('\n').find((row) => row.startsWith('fpr:'));
  if (!line) throw new Error(`gpg has no key for ${uid}`);
  return line.split(':')[9];
}

function generateInGpg(algorithm: Algorithm, uid: string): string {
  const [primary, subkey] = algorithm === 'ed25519' ? ['ed25519', 'cv25519'] : ['rsa4096', 'rsa4096'];
  gpg(['--quick-generate-key', uid, primary, 'sign,cert', 'never']);
  const fingerprint = gpgFingerprint(uid);
  gpg(['--quick-add-key', fingerprint, subkey, 'encr', 'never']);
  return fingerprint;
}

async function runFor(algorithm: Algorithm, suffix: string): Promise<void> {
  console.log(`\n== ${algorithm === 'ed25519' ? 'Ed25519 / X25519' : 'RSA 4096'} ==`);
  const started = Date.now();

  // Sfragis side: Maria. GnuPG side: Nikos. Both invented.
  const maria = await pgp.generateKeyPair({
    name: 'Maria Vlachou',
    email: `maria.vlachou+${suffix}@example.org`,
    passphrase,
    algorithm,
    expiresInDays: 0,
  });
  const nikosUid = `Nikos Karras <nikos.karras+${suffix}@example.org>`;
  const nikosFingerprint = generateInGpg(algorithm, nikosUid);

  // --- Key import, both ways ---
  let nikosPublic = '';
  let nikosPrivate = '';
  await attempt('gpg imports the Sfragis public key', () => {
    const { status } = gpg(['--import'], maria.armoredPublic);
    check(/IMPORT_OK/.test(status) && gpgFingerprint(maria.info.fingerprint) === maria.info.fingerprint,
      'gpg imports the Sfragis public key', status);
  });
  await attempt('Sfragis imports the gpg public key', async () => {
    nikosPublic = gpg(['--armor', '--export', nikosFingerprint]).stdout;
    const [parsed] = await pgp.parseKeys(nikosPublic);
    check(
      parsed.info.fingerprint === nikosFingerprint && parsed.info.canEncrypt && !parsed.info.isPrivate,
      'Sfragis imports the gpg public key',
      JSON.stringify(parsed.info),
    );
  });
  await attempt('Sfragis imports the gpg private key', async () => {
    nikosPrivate = gpg(['--armor', '--export-secret-keys', nikosFingerprint]).stdout;
    const [parsed] = await pgp.parseKeys(nikosPrivate);
    check(parsed.info.isPrivate && !parsed.isUnprotected && parsed.info.canSign,
      'Sfragis imports the gpg private key (passphrase-protected)', JSON.stringify(parsed.info));
    await pgp.verifyPassphrase(nikosPrivate, passphrase);
    check(true, 'Sfragis unlocks the gpg private key with its passphrase');
  });

  // --- Sfragis encrypts and signs, gpg decrypts and verifies ---
  await attempt('Sfragis -> gpg', async () => {
    const armored = await pgp.encryptText({
      text: MESSAGE,
      recipientPublicKeys: [nikosPublic],
      signer: { armoredPrivate: maria.armoredPrivate, passphrase },
    });
    const { stdout, status } = gpg(['--decrypt'], armored);
    check(stdout === MESSAGE, 'gpg decrypts a Sfragis message', JSON.stringify(stdout));
    check(new RegExp(`VALIDSIG ${maria.info.fingerprint}`).test(status) && /GOODSIG/.test(status),
      'gpg verifies the Sfragis signature', status);
    check(!/DECRYPTION_COMPLIANCE_MODE|BADMDC|NO_MDC/.test(status) && /DECRYPTION_OKAY/.test(status),
      'gpg reports integrity-protected decryption', status);
  });

  // --- gpg encrypts and signs, Sfragis decrypts and verifies ---
  await attempt('gpg -> Sfragis', async () => {
    const { stdout: armored } = gpg(
      ['--armor', '--sign', '--encrypt', '--recipient', maria.info.fingerprint, '--local-user', nikosFingerprint],
      MESSAGE,
    );
    const result = await pgp.decryptText({
      armoredMessage: armored,
      armoredPrivate: maria.armoredPrivate,
      passphrase,
      verificationKeys: [nikosPublic, maria.armoredPublic],
    });
    check(result.text === MESSAGE, 'Sfragis decrypts a gpg message', JSON.stringify(result.text));
    check(
      result.signature.state === 'valid' && result.signature.signer?.fingerprint === nikosFingerprint,
      'Sfragis verifies the gpg signature ("Signed by Nikos Karras")',
      JSON.stringify(result.signature),
    );
  });

  // --- Each side decrypts with the private key the other exported ---
  await attempt('gpg uses the Sfragis private key', () => {
    const { status } = gpg(['--import'], maria.armoredPrivate);
    check(/IMPORT_OK/.test(status) && /sec/.test(gpg(['--list-secret-keys', maria.info.fingerprint]).stdout),
      'gpg imports the Sfragis private key', status);
    const { stdout: armored } = gpg(['--armor', '--encrypt', '--recipient', maria.info.fingerprint], MESSAGE);
    // Decrypting with the imported secret key proves gpg can unlock Sfragis' S2K.
    const { stdout } = gpg(['--decrypt'], armored);
    check(stdout === MESSAGE, 'gpg decrypts with the imported Sfragis private key');
  });
  await attempt('Sfragis uses the gpg private key', async () => {
    const armored = await pgp.encryptText({ text: MESSAGE, recipientPublicKeys: [nikosPublic] });
    const result = await pgp.decryptText({
      armoredMessage: armored,
      armoredPrivate: nikosPrivate,
      passphrase,
      verificationKeys: [],
    });
    check(result.text === MESSAGE && result.signature.state === 'none',
      'Sfragis decrypts with the imported gpg private key');
  });

  // --- Revocation travels to gpg ---
  await attempt('revocation', async () => {
    const revoked = await pgp.revokeKey({ armoredPrivate: maria.armoredPrivate, passphrase, reason: 'retired' });
    gpg(['--import'], revoked.armoredPublic);
    const listing = gpg(['--with-colons', '--list-keys', maria.info.fingerprint]).stdout;
    check(/^pub:r:/m.test(listing), 'gpg sees the Sfragis revocation', listing.split('\n')[0]);
  });

  console.log(`      (${Math.round((Date.now() - started) / 100) / 10} s)`);
}

async function main(): Promise<void> {
  const version = execFileSync('gpg', ['--version'], { encoding: 'utf8' }).split('\n')[0];
  console.log(`Using ${version}, GNUPGHOME ${home}`);
  try {
    await runFor('ed25519', 'ed');
    await runFor('rsa4096', 'rsa');
  } finally {
    try {
      execFileSync('gpgconf', ['--homedir', home, '--kill', 'all'], { stdio: 'ignore' });
    } catch {
      // gpgconf is optional; the directory is removed either way.
    }
    rmSync(home, { recursive: true, force: true });
  }
  if (failures > 0) {
    console.log(`\nGPG INTEROP FAILED (${failures})`);
    process.exit(1);
  }
  console.log('\nGPG INTEROP PASSED');
}

main().catch((error) => {
  console.error(error);
  rmSync(home, { recursive: true, force: true });
  process.exit(1);
});
