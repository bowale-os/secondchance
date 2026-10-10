// Where each profile's PIN-wrapped key is kept on phones.
import * as SecureStore from 'expo-secure-store';
import type { VaultStore } from './KeyVault';
import { vaultKey } from './vaultStores';

/** The OS keystore (Android Keystore / iOS Keychain), never backed up off the device. */
export function secureStoreVault(profileId: string): VaultStore {
  const key = vaultKey(profileId);
  const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  return {
    get: () => SecureStore.getItemAsync(key, opts),
    set: value => SecureStore.setItemAsync(key, value, opts),
    clear: () => SecureStore.deleteItemAsync(key, opts),
  };
}
