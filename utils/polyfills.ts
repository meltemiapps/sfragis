/**
 * Runtime globals OpenPGP.js needs on Hermes. Import this before anything else.
 *
 * OpenPGP.js 6 requires WebCrypto at load time and Hermes has none, so
 * react-native-quick-crypto supplies a native, OpenSSL-backed `crypto` global.
 */
import { install as installNativeCrypto } from 'react-native-quick-crypto';
import { ReadableStream, TransformStream, WritableStream } from 'web-streams-polyfill';

type MutableGlobal = Record<string, unknown>;
const target = globalThis as unknown as MutableGlobal;

installNativeCrypto();

function assertSecureRandom(): void {
  const first = crypto.getRandomValues(new Uint8Array(32));
  const second = crypto.getRandomValues(new Uint8Array(32));
  const isBlank = first.every((byte) => byte === 0);
  const isRepeat = first.every((byte, index) => byte === second[index]);
  if (isBlank || isRepeat) {
    throw new Error('The platform random number generator failed its start-up check.');
  }
  if (typeof crypto.subtle?.digest !== 'function') {
    throw new Error('Native WebCrypto is not available.');
  }
}

/** Minimal UTF-8 decoder with streaming support, used only if the runtime has none. */
class Utf8Decoder {
  readonly encoding = 'utf-8';
  readonly fatal = false;
  readonly ignoreBOM = true;
  private pending: number[] = [];

  decode(input?: ArrayBufferView | ArrayBuffer, options?: { stream?: boolean }): string {
    const incoming = !input
      ? new Uint8Array(0)
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    const bytes = this.pending.length ? [...this.pending, ...incoming] : incoming;
    this.pending = [];

    let output = '';
    let index = 0;
    while (index < bytes.length) {
      const lead = bytes[index];
      const size = lead < 0x80 ? 1 : lead >> 5 === 6 ? 2 : lead >> 4 === 14 ? 3 : lead >> 3 === 30 ? 4 : 0;
      if (size === 0) {
        output += '�';
        index += 1;
        continue;
      }
      if (index + size > bytes.length) {
        if (options?.stream) {
          this.pending = Array.from(bytes).slice(index);
          return output;
        }
        output += '�';
        break;
      }
      let codePoint = size === 1 ? lead : lead & (0xff >> (size + 1));
      let valid = true;
      for (let offset = 1; offset < size; offset += 1) {
        const next = bytes[index + offset];
        if (next >> 6 !== 2) {
          valid = false;
          break;
        }
        codePoint = (codePoint << 6) | (next & 0x3f);
      }
      const minimum = [0, 0, 0x80, 0x800, 0x10000][size];
      const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
      if (!valid || codePoint < minimum || codePoint > 0x10ffff || isSurrogate) {
        output += '�';
        index += 1;
        continue;
      }
      output += String.fromCodePoint(codePoint);
      index += size;
    }
    return output;
  }
}

assertSecureRandom();

if (typeof target.TextDecoder !== 'function') target.TextDecoder = Utf8Decoder;
if (typeof target.ReadableStream !== 'function') target.ReadableStream = ReadableStream;
if (typeof target.WritableStream !== 'function') target.WritableStream = WritableStream;
if (typeof target.TransformStream !== 'function') target.TransformStream = TransformStream;
