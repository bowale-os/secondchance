import { describe, expect, it, vi } from 'vitest';
import { CloudStorageProvider } from '../providers/CloudStorageProvider';
import { SyncConflictError } from '../errors';
import { KEY, makeDoc } from './fixtures';

function setup(responses: Response[], enabled = true) {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const r of responses) fetchImpl.mockResolvedValueOnce(r);
  const cloud = new CloudStorageProvider({
    apiUrl: 'https://api.example.test',
    getAuthToken: async () => 'token-abc',
    enabled,
    isOnline: async () => true,
    encryptionKey: KEY,
    fetchImpl,
  });
  return { cloud, fetchImpl };
}

describe('CloudStorageProvider (AWS placeholder)', () => {
  it('is unavailable until AWS_ENABLED is turned on', async () => {
    expect(await setup([], false).cloud.isAvailable()).toBe(false);
    expect(await setup([], true).cloud.isAvailable()).toBe(true);
  });

  it('sends only ciphertext to our API, with the auth token', async () => {
    const { cloud, fetchImpl } = setup([new Response(null, { status: 204 })]);
    const doc = makeDoc({ version: 3 });
    await cloud.saveDocument(doc);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.example.test/storage/documents/${doc.id}`);
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
    const body = JSON.parse(init?.body as string);
    expect(body.version).toBe(3);
    expect(init?.body).not.toContain('2026-CR-0412');
  });

  it('turns HTTP 409 into a sync conflict', async () => {
    const { cloud } = setup([new Response(null, { status: 409 })]);
    await expect(cloud.saveDocument(makeDoc())).rejects.toThrow(SyncConflictError);
  });

  it('encrypts files before uploading to the pre-signed URL', async () => {
    const { cloud, fetchImpl } = setup([
      Response.json({ url: 'https://s3.example.test/put', key: 'tenants/t/users/u/page-1.jpg' }),
      new Response(null, { status: 200 }),
    ]);
    const data = new TextEncoder().encode('Case No. 2026-CR-0412');
    const ref = await cloud.putBlob('page-1.jpg', data, 'image/jpeg');

    expect(ref).toMatchObject({ key: 'tenants/t/users/u/page-1.jpg', location: 'both', size: data.byteLength });
    const [, putInit] = fetchImpl.mock.calls[1];
    const uploaded = new TextDecoder().decode(putInit?.body as Uint8Array);
    expect(uploaded).not.toContain('2026-CR-0412');
  });
});
