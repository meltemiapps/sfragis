/// <reference types="node" />
/** Runs the suite on Node, where OpenPGP.js uses native WebCrypto. */
import { webcrypto } from 'node:crypto';

import { runSuite } from './suite';

const randomBytes = (length: number) => webcrypto.getRandomValues(new Uint8Array(length));

runSuite(console.log, () => performance.now(), { rsa: process.argv.includes('--rsa'), randomBytes }).catch((error) => {
  console.error(error);
  process.exit(1);
});
