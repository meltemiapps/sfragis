/** Device-backed storage for the vault. Kept apart so the vault logic stays testable. */
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { Vault, type BlobStore, type SecretStore } from './vault';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const secrets: SecretStore = {
  get: (name) => SecureStore.getItemAsync(name, secureStoreOptions),
  set: (name, value) => SecureStore.setItemAsync(name, value, secureStoreOptions),
  remove: (name) => SecureStore.deleteItemAsync(name, secureStoreOptions),
};

const blobFile = () => new File(Paths.document, 'keyring.v1.sealed');
const stagingFile = () => new File(Paths.document, 'keyring.v1.staging');

const blobs: BlobStore = {
  async read() {
    const file = blobFile();
    if (file.exists) return file.bytes();
    // Staging is complete before the live file is removed, so it is safe to recover from.
    const staging = stagingFile();
    return staging.exists ? staging.bytes() : null;
  },
  async write(bytes) {
    // Write beside the live file, then swap, so a crash cannot leave a torn keyring.
    const staging = stagingFile();
    if (staging.exists) staging.delete();
    staging.create();
    staging.write(bytes);
    const live = blobFile();
    if (live.exists) live.delete();
    staging.move(live);
  },
  async remove() {
    for (const file of [blobFile(), stagingFile()]) {
      if (file.exists) file.delete();
    }
  },
};

export function createDeviceVault(): Vault {
  return new Vault(secrets, blobs, (length) => crypto.getRandomValues(new Uint8Array(length)));
}
