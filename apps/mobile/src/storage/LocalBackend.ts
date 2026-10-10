// The raw on-device store under LocalStorageProvider. Backends only ever see
// ciphertext plus the few plain fields needed to find records.
//   SqliteBackend    – Android / iOS (expo-sqlite + files on disk)
//   IndexedDbBackend – web / shared computers
//   MemoryBackend    – tests

export interface DocRecord {
  id: string;
  ownerId: string;
  updatedAt: string;
  deletedAt?: string;
  ciphertext: string;      // encrypted StoredDocument JSON
}

export interface LocalBackend {
  init(): Promise<void>;

  putDoc(record: DocRecord): Promise<void>;
  getDoc(id: string): Promise<DocRecord | null>;
  listDocs(ownerId: string, updatedSince?: string): Promise<DocRecord[]>;
  deleteDoc(id: string): Promise<void>;

  putBlob(key: string, data: Uint8Array): Promise<void>;   // data is already encrypted
  getBlob(key: string): Promise<Uint8Array | null>;
  deleteBlob(key: string): Promise<void>;
  /** Deletes every file whose key starts with prefix, e.g. one profile's "owners/{id}/". */
  deleteBlobsWithPrefix(prefix: string): Promise<void>;

  // Small key/value settings, e.g. the persisted sync outbox.
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  /** Remove everything for every profile: a full device reset. */
  wipe(): Promise<void>;
}

/** Every file a profile owns lives under this prefix, so it can be removed in one sweep. */
export const ownerPrefix = (ownerId: string) => `owners/${ownerId}/`;

export const blobKey = (ownerId: string, docId: string, name: string) =>
  `${ownerPrefix(ownerId)}docs/${docId}/${name}`;

/**
 * Removes one profile's documents, files, and sync outbox. Needs no decryption key,
 * so it also works for a profile whose PIN was forgotten.
 */
export async function deleteOwnerData(backend: LocalBackend, ownerId: string) {
  for (const r of await backend.listDocs(ownerId)) await backend.deleteDoc(r.id);
  await backend.deleteBlobsWithPrefix(ownerPrefix(ownerId));
  await backend.setMeta(`sync.outbox.${ownerId}`, '');
}
