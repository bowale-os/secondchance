// Opens storage for one logged-in profile. Choosing the cloud is one switch: STORAGE_MODE.
// The platform-specific parts (which backend) are passed in by the app entry point, so
// this file runs unchanged in tests.
import type { StorageMode } from '../config';
import type { LocalBackend } from './LocalBackend';
import type { CloudConfig } from './providers/CloudStorageProvider';
import { CloudStorageProvider } from './providers/CloudStorageProvider';
import { LocalStorageProvider } from './providers/LocalStorageProvider';
import { DocumentRepository } from './DocumentRepository';
import { SyncService, metaOutboxStore } from './SyncService';

export interface StorageOptions {
  mode: StorageMode;
  backend: LocalBackend;
  /** The logged-in profile, from ProfileManager.login / createProfile. */
  ownerId: string;
  /** That profile's data key, unlocked by its name + PIN. */
  dataKey: Uint8Array;
  cloud?: Omit<CloudConfig, 'encryptionKey'> & { encryptionKey?: Uint8Array };
}

export async function createStorage(opts: StorageOptions) {
  const local = new LocalStorageProvider(opts.backend, opts.dataKey);
  await local.init();

  const remote = opts.mode === 'local' || !opts.cloud
    ? null
    : new CloudStorageProvider({ ...opts.cloud, encryptionKey: opts.cloud.encryptionKey ?? opts.dataKey });

  const sync = new SyncService(local, remote, metaOutboxStore(local, opts.ownerId));
  await sync.init();
  const documents = new DocumentRepository(local, sync, opts.ownerId);
  return { local, sync, documents };
}

export type Storage = Awaited<ReturnType<typeof createStorage>>;
