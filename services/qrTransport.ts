/**
 * Moves payloads too large for one QR code across a looping sequence of codes.
 *
 * Frame: SFG1:<digest>:<index>/<total>:<chunk>
 * The digest is the first 16 hex characters of SHA-256 over the whole payload.
 * Frames arrive in any order and missed ones are picked up on the next loop.
 */
import { sha256 } from '@noble/hashes/sha2.js';

const FRAME_PATTERN = /^SFG1:([0-9a-f]{16}):(\d{1,3})\/(\d{1,3}):([\s\S]+)$/;

/** Payloads up to this size go in one standard QR code that any reader can scan. */
export const SINGLE_QR_LIMIT = 800;
export const FRAME_CHUNK_SIZE = 360;
const MAX_FRAMES = 200;

function payloadDigest(payload: string): string {
  const hash = sha256(new TextEncoder().encode(payload));
  return Array.from(hash.slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Returns one raw payload for small data, or numbered frames for large data. */
export function encodeFrames(payload: string): string[] {
  if (payload.length <= SINGLE_QR_LIMIT) return [payload];
  const total = Math.ceil(payload.length / FRAME_CHUNK_SIZE);
  if (total > MAX_FRAMES) throw new Error('This payload is too large to transfer by QR code.');
  const digest = payloadDigest(payload);
  return Array.from(
    { length: total },
    (_, index) =>
      `SFG1:${digest}:${index + 1}/${total}:${payload.slice(index * FRAME_CHUNK_SIZE, (index + 1) * FRAME_CHUNK_SIZE)}`,
  );
}

export function isFrame(value: string): boolean {
  return FRAME_PATTERN.test(value);
}

export type AssemblyState =
  | { status: 'ignored' }
  | { status: 'progress'; received: number; total: number; missing: number[] }
  | { status: 'failed'; reason: string }
  | { status: 'complete'; payload: string };

export class FrameAssembler {
  private digest: string | null = null;
  private total = 0;
  private chunks = new Map<number, string>();

  reset(): void {
    this.digest = null;
    this.total = 0;
    this.chunks.clear();
  }

  add(raw: string): AssemblyState {
    const match = FRAME_PATTERN.exec(raw);
    if (!match) return { status: 'ignored' };
    const [, digest, indexText, totalText, chunk] = match;
    const index = Number(indexText);
    const total = Number(totalText);
    if (total < 2 || total > MAX_FRAMES || index < 1 || index > total) return { status: 'ignored' };

    // A different digest means a new transfer has started on the sending screen.
    if (digest !== this.digest || total !== this.total) {
      this.reset();
      this.digest = digest;
      this.total = total;
    }
    this.chunks.set(index, chunk);

    if (this.chunks.size < total) {
      const missing: number[] = [];
      for (let part = 1; part <= total; part += 1) {
        if (!this.chunks.has(part)) missing.push(part);
      }
      return { status: 'progress', received: this.chunks.size, total, missing };
    }

    const payload = Array.from({ length: total }, (_, part) => this.chunks.get(part + 1)).join('');
    this.reset();
    if (payloadDigest(payload) !== digest) {
      return { status: 'failed', reason: 'The scanned parts did not match. Scan the code again.' };
    }
    return { status: 'complete', payload };
  }
}
