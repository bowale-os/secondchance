import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, fromBase64, generateKey, toBase64, encryptBytes, decryptBytes } from '../crypto';
import { DecryptError } from '../errors';
import { KEY } from './fixtures';

describe('crypto', () => {
  it('round-trips JSON and never stores plain text', () => {
    const ct = encryptJson(KEY, { ssn: '123-45-6789' });
    expect(ct).not.toContain('123-45-6789');
    expect(decryptJson(KEY, ct)).toEqual({ ssn: '123-45-6789' });
  });

  it('uses a fresh nonce each time', () => {
    expect(encryptJson(KEY, 'same')).not.toEqual(encryptJson(KEY, 'same'));
  });

  it('fails with the wrong key', () => {
    const ct = encryptJson(KEY, 'secret');
    expect(() => decryptJson(generateKey(), ct)).toThrow(DecryptError);
  });

  it('round-trips binary data', () => {
    const data = new Uint8Array([0, 1, 2, 250, 255]);
    expect(decryptBytes(KEY, encryptBytes(KEY, data))).toEqual(data);
  });

  it('base64 matches the platform encoder for every padding length', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 31]) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37) % 256);
      const b64 = toBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect(fromBase64(b64)).toEqual(bytes);
    }
  });
});
