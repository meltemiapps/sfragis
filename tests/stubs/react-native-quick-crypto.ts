/**
 * Test-only WebCrypto for the bare Hermes VM, which cannot load native modules.
 * Never resolved in an app build. Its Math.random generator is not secure.
 *
 * Ed25519 and X25519 report NotSupportedError, which sends OpenPGP.js down its
 * bundled noble code path.
 */
import { aeskw, cbc, ctr, gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';

type Bytes = Uint8Array;
type Named = { name?: string; hash?: unknown; iv?: Bytes; counter?: Bytes; salt?: Bytes; info?: Bytes; additionalData?: Bytes };
interface StubKey {
  name: string;
  raw: Bytes;
}

const HASHES: Record<string, typeof sha256> = {
  'SHA-1': sha1 as unknown as typeof sha256,
  'SHA-256': sha256,
  'SHA-384': sha384 as unknown as typeof sha256,
  'SHA-512': sha512 as unknown as typeof sha256,
};

function nameOf(algorithm: string | Named): string {
  return (typeof algorithm === 'string' ? algorithm : (algorithm.name ?? '')).toUpperCase();
}

function asBytes(data: ArrayBufferView | ArrayBuffer): Bytes {
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function buffer(bytes: Bytes): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function unsupported(): never {
  const error = new Error('Not supported by the test double');
  error.name = 'NotSupportedError';
  throw error;
}

const subtle = {
  async digest(algorithm: string | Named, data: ArrayBufferView): Promise<ArrayBuffer> {
    const hash = HASHES[nameOf(algorithm)];
    if (!hash) unsupported();
    return buffer(hash(asBytes(data)));
  },
  async importKey(format: string, data: Bytes, algorithm: string | Named): Promise<StubKey> {
    if (format !== 'raw') unsupported();
    return { name: nameOf(algorithm), raw: asBytes(data).slice() };
  },
  async exportKey(format: string, key: StubKey): Promise<ArrayBuffer> {
    if (format !== 'raw') unsupported();
    return buffer(key.raw);
  },
  async generateKey(): Promise<never> {
    return unsupported();
  },
  async encrypt(algorithm: Named, key: StubKey, data: Bytes): Promise<ArrayBuffer> {
    const input = asBytes(data);
    switch (nameOf(algorithm)) {
      case 'AES-CBC':
        return buffer(cbc(key.raw, algorithm.iv as Bytes).encrypt(input));
      case 'AES-CTR':
        return buffer(ctr(key.raw, algorithm.counter as Bytes).encrypt(input));
      case 'AES-GCM':
        return buffer(gcm(key.raw, algorithm.iv as Bytes, algorithm.additionalData).encrypt(input));
      default:
        return unsupported();
    }
  },
  async decrypt(algorithm: Named, key: StubKey, data: Bytes): Promise<ArrayBuffer> {
    if (nameOf(algorithm) !== 'AES-GCM') unsupported();
    return buffer(gcm(key.raw, algorithm.iv as Bytes, algorithm.additionalData).decrypt(asBytes(data)));
  },
  async deriveBits(algorithm: Named, key: StubKey, length: number): Promise<ArrayBuffer> {
    if (nameOf(algorithm) !== 'HKDF') unsupported();
    const hash = HASHES[nameOf(algorithm.hash as string | Named)];
    return buffer(hkdf(hash, key.raw, algorithm.salt, algorithm.info, length / 8));
  },
  async wrapKey(_format: string, key: StubKey, wrapping: StubKey): Promise<ArrayBuffer> {
    return buffer(aeskw(wrapping.raw).encrypt(key.raw));
  },
  async unwrapKey(_format: string, wrapped: Bytes, wrapping: StubKey, _algorithm: unknown, unwrapped: Named): Promise<StubKey> {
    return { name: nameOf(unwrapped), raw: aeskw(wrapping.raw).decrypt(asBytes(wrapped)) };
  },
  async sign(): Promise<never> {
    return unsupported();
  },
  async verify(): Promise<never> {
    return unsupported();
  },
};

function getRandomValues<T extends Uint8Array>(target: T): T {
  for (let index = 0; index < target.length; index += 1) {
    target[index] = Math.floor(Math.random() * 256);
  }
  return target;
}

export function install(): void {
  (globalThis as unknown as { crypto: unknown }).crypto = { getRandomValues, subtle };
}
