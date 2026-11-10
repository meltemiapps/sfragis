import * as Clipboard from 'expo-clipboard';

import { CLIPBOARD_CLEAR_SECONDS } from './constants';

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingClear(): void {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
}

/** For public material: public keys, fingerprints and ciphertext. */
export async function copyPublic(text: string): Promise<void> {
  cancelPendingClear();
  await Clipboard.setStringAsync(text);
}

/**
 * For decrypted text and private keys. The clipboard is emptied after a minute,
 * while the app is running; the OS may suspend the timer in the background.
 */
export async function copySensitive(text: string): Promise<void> {
  cancelPendingClear();
  await Clipboard.setStringAsync(text);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    void Clipboard.setStringAsync('');
  }, CLIPBOARD_CLEAR_SECONDS * 1000);
}

export function pasteText(): Promise<string> {
  return Clipboard.getStringAsync();
}
