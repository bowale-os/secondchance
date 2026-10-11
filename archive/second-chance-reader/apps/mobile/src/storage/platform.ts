// Web / shared computers: IndexedDB, with each profile's wrapped key in the meta table.
// (Phones use platform.native.ts; Metro picks the right file per platform.)
import { IndexedDbBackend } from './backends/IndexedDbBackend';
import { metaVault } from './vaultStores';

export function createPlatformStorage() {
  const backend = new IndexedDbBackend();
  return {
    backend,
    vaultStoreFor: (profileId: string) => metaVault(backend, profileId),
    /** Browsers have fast native PBKDF2, so use the full OWASP count. */
    pinIterations: 600_000,
  };
}
