// Where each profile's PIN-wrapped key is kept on the web. (Phones: see secureStoreVault.ts.)
import type { LocalBackend } from './LocalBackend';
import type { VaultStore } from './KeyVault';

export const vaultKey = (profileId: string) => `scr.vault.${profileId}`;

/**
 * Web: the backend's meta table. Only the wrapped key is stored; it is useless without the PIN.
 * A full device reset (backend.wipe) removes these too.
 */
export function metaVault(backend: Pick<LocalBackend, 'getMeta' | 'setMeta'>, profileId: string): VaultStore {
  const key = vaultKey(profileId);
  return {
    get: async () => (await backend.getMeta(key)) || null,
    set: value => backend.setMeta(key, value),
    clear: () => backend.setMeta(key, ''),
  };
}
