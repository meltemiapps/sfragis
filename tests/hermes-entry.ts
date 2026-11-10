/** Entry for the bare Hermes VM run. See scripts/test-hermes.sh. */
import '../utils/polyfills';

import { runSuite } from './suite';

declare const print: (...values: unknown[]) => void;
declare const SFRAGIS_RSA: boolean | undefined;

const randomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));
const rsa = typeof SFRAGIS_RSA !== 'undefined' && SFRAGIS_RSA;

print(`subtle present: ${typeof (crypto as { subtle?: unknown }).subtle !== 'undefined'}`);
runSuite(print, () => Date.now(), { rsa, randomBytes }).catch((error: Error) => {
  print(`SUITE FAILED: ${error?.message}\n${error?.stack ?? ''}`);
});
