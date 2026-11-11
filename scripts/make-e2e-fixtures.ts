/// <reference types="node" />
/**
 * Writes public keys for invented contacts to e2e/fixtures/. The private halves
 * and their passphrases exist only in memory and are discarded.
 * Run: npx tsx scripts/make-e2e-fixtures.ts
 */
import { webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as pgp from '../services/pgpService';

const contacts = [
  { file: 'nikos-karras.asc', name: 'Nikos Karras', email: 'nikos.karras@example.org' },
  { file: 'eleni-papadaki.asc', name: 'Eleni Papadaki', email: 'eleni.papadaki@example.org' },
  { file: 'yannis-dimou.asc', name: 'Yannis Dimou', email: 'yannis.dimou@example.org' },
];

async function main(): Promise<void> {
  for (const contact of contacts) {
    const passphrase = Buffer.from(webcrypto.getRandomValues(new Uint8Array(24))).toString('base64');
    const key = await pgp.generateKeyPair({ ...contact, passphrase, algorithm: 'ed25519', expiresInDays: 0 });
    writeFileSync(join(__dirname, '..', 'e2e', 'fixtures', contact.file), key.armoredPublic.trim() + '\n');
    console.log(`${contact.file}  ${key.info.fingerprint}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
