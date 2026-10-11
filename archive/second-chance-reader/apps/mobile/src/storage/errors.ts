export class SyncConflictError extends Error {
  constructor(public readonly path: string) {
    super(`Sync conflict at ${path}: the cloud has a newer copy`);
    this.name = 'SyncConflictError';
  }
}

export class BlobNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`File not found: ${key}`);
    this.name = 'BlobNotFoundError';
  }
}

export class DecryptError extends Error {
  constructor() {
    super('Could not decrypt stored data (wrong key or damaged data)');
    this.name = 'DecryptError';
  }
}
