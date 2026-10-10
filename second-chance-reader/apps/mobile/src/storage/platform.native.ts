// Android / iOS: SQLite + files, with each profile's wrapped key in the OS keystore.
import { SqliteBackend } from './backends/SqliteBackend';
import { secureStoreVault } from './secureStoreVault';

export function createPlatformStorage() {
  return {
    backend: new SqliteBackend(),
    vaultStoreFor: secureStoreVault,
    /**
     * Phones have no native PBKDF2 here, so it runs in plain JavaScript, which is slow.
     * The wrapped key is also inside the hardware keystore, so fewer rounds are acceptable.
     * TODO: measure login time on a low-end Android phone in Section 5 and tune this.
     */
    pinIterations: 100_000,
  };
}
