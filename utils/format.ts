import type { KeyInfo } from '../services/pgpService';

/** Groups a fingerprint into blocks of four, the form people compare aloud. */
export function groupFingerprint(fingerprint: string): string {
  return fingerprint.match(/.{1,4}/g)?.join(' ') ?? fingerprint;
}

export function shortFingerprint(fingerprint: string): string {
  return groupFingerprint(fingerprint.slice(-16));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function isExpired(info: KeyInfo, now = Date.now()): boolean {
  return info.expiresAt !== null && new Date(info.expiresAt).getTime() <= now;
}

export function keyStatusLabel(info: KeyInfo): string {
  if (info.isRevoked) return 'Revoked';
  if (isExpired(info)) return 'Expired';
  return info.expiresAt ? `Expires ${formatDate(info.expiresAt)}` : 'No expiry';
}

export function keyLabel(info: KeyInfo): string {
  return info.name || info.email || shortFingerprint(info.fingerprint);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

/**
 * Yields one frame so a progress state can paint before CPU-bound crypto
 * occupies the JS thread.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
