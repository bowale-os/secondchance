// Client side of the cloud: calls OUR API only. AWS access (S3, DynamoDB, KMS) lives on
// the server; the phone never holds AWS keys, only a Cognito token and 5-minute
// pre-signed URLs. Documents and files are encrypted here before they leave the device.
//
// Idle until the AWS setup checklist in the design plan is done. Search for TODO(cloud).
import type { BlobRef, StoredDocument } from '@scr/shared';
import type { ListQuery, StorageProvider } from '../StorageProvider';
import { decryptBytes, decryptJson, encryptBytes, encryptJson, sha256Base64 } from '../crypto';
import { SyncConflictError } from '../errors';

export interface CloudConfig {
  apiUrl: string;
  /** TODO(cloud): Cognito ID token (Amplify Auth or amazon-cognito-identity-js). */
  getAuthToken: () => Promise<string>;
  /** TODO(cloud): set AWS_ENABLED=true once the AWS resources exist. */
  enabled: boolean;
  isOnline: () => Promise<boolean>;
  /**
   * Key used for everything sent to the cloud.
   * TODO(cloud): to restore on a new phone this key must be recoverable (e.g. wrapped by a
   * key derived from the resident's PIN, or escrowed via KMS). Decide before turning on hybrid mode.
   */
  encryptionKey: Uint8Array;
  fetchImpl?: typeof fetch;
}

interface CloudDocRow { id: string; version: number; ciphertext: string; deletedAt?: string }

export class CloudStorageProvider implements StorageProvider {
  readonly name = 'aws';
  private fetch: typeof fetch;

  constructor(private cfg: CloudConfig) {
    this.fetch = cfg.fetchImpl ?? fetch;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    const token = await this.cfg.getAuthToken();
    const res = await this.fetch(`${this.cfg.apiUrl}/storage${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (res.status === 409) throw new SyncConflictError(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage API ${res.status}`);
    return res.status === 204 ? null : (await res.json()) as T;
  }

  async init() {}

  async isAvailable() {
    return this.cfg.enabled && (await this.cfg.isOnline());
  }

  async saveDocument(doc: StoredDocument) {
    await this.api(`/documents/${encodeURIComponent(doc.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        version: doc.version,
        ciphertext: encryptJson(this.cfg.encryptionKey, doc),
        deletedAt: doc.deletedAt,
      }),
    });
    return doc;
  }

  async getDocument(id: string) {
    const row = await this.api<CloudDocRow>(`/documents/${encodeURIComponent(id)}`);
    if (!row || row.deletedAt) return null;
    return decryptJson<StoredDocument>(this.cfg.encryptionKey, row.ciphertext);
  }

  async listDocuments(q: ListQuery) {
    const params = new URLSearchParams({ since: q.updatedSince ?? '', cursor: q.cursor ?? '' });
    const r = await this.api<{ items: CloudDocRow[]; nextCursor?: string }>(`/documents?${params}`);
    const items = (r?.items ?? [])
      .filter(i => !i.deletedAt)
      .map(i => decryptJson<StoredDocument>(this.cfg.encryptionKey, i.ciphertext));
    return { items, nextCursor: r?.nextCursor };
  }

  async deleteDocument(id: string) {
    await this.api(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async putBlob(key: string, data: Uint8Array, contentType: string): Promise<BlobRef> {
    const encrypted = encryptBytes(this.cfg.encryptionKey, data);
    const uploadChecksum = sha256Base64(encrypted);   // S3 verifies the bytes it receives
    const target = await this.api<{ url: string; key: string }>('/upload-url', {
      method: 'POST',
      body: JSON.stringify({ key, contentType: 'application/octet-stream', checksum: uploadChecksum }),
    });
    if (!target) throw new Error('Storage API returned no upload URL');
    const put = await this.fetch(target.url, {
      method: 'PUT',
      body: encrypted as BodyInit,
      headers: { 'Content-Type': 'application/octet-stream', 'x-amz-checksum-sha256': uploadChecksum },
    });
    if (!put.ok) throw new Error(`Upload failed ${put.status}`);
    return { key: target.key, contentType, size: data.byteLength, checksum: sha256Base64(data), location: 'both' };
  }

  async getBlob(ref: BlobRef) {
    const target = await this.api<{ url: string }>('/download-url', {
      method: 'POST', body: JSON.stringify({ key: ref.key }),
    });
    if (!target) throw new Error('Storage API returned no download URL');
    const res = await this.fetch(target.url);
    if (!res.ok) throw new Error(`Download failed ${res.status}`);
    return decryptBytes(this.cfg.encryptionKey, new Uint8Array(await res.arrayBuffer()));
  }

  async deleteBlob(ref: BlobRef) {
    await this.api(`/blobs?key=${encodeURIComponent(ref.key)}`, { method: 'DELETE' });
  }
}
