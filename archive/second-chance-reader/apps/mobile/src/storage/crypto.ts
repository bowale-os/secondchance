// Client-side encryption. Everything is encrypted on the device before it is
// written to disk or sent anywhere, so storage (local or cloud) only holds ciphertext.
//
// AES-256-GCM with a random 12-byte nonce per message (pure JS, so it runs the same
// on Android, iOS, web, and in tests). React Native needs a crypto.getRandomValues
// polyfill installed at app start for randomBytes to work.
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, managedNonce, randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { DecryptError } from './errors';

const aes = managedNonce(gcm);   // prepends the nonce to the ciphertext
const PREFIX = 'v1.';

export const KEY_BYTES = 32;

export function generateKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

export function encryptBytes(key: Uint8Array, data: Uint8Array): Uint8Array {
  return aes(key).encrypt(data);
}

export function decryptBytes(key: Uint8Array, data: Uint8Array): Uint8Array {
  try {
    return aes(key).decrypt(data);
  } catch {
    throw new DecryptError();
  }
}

export function encryptJson(key: Uint8Array, value: unknown): string {
  return PREFIX + toBase64(encryptBytes(key, utf8ToBytes(JSON.stringify(value))));
}

export function decryptJson<T>(key: Uint8Array, ciphertext: string): T {
  if (!ciphertext.startsWith(PREFIX)) throw new DecryptError();
  return JSON.parse(bytesToUtf8(decryptBytes(key, fromBase64(ciphertext.slice(PREFIX.length))))) as T;
}

export function sha256Base64(data: Uint8Array): string {
  return toBase64(sha256(data));
}

// Small base64 helpers so we don't depend on atob/btoa or Buffer, which differ by platform.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
      + (i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=')
      + (i + 2 < bytes.length ? ALPHABET[n & 63] : '=');
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0, value = 0, j = 0;
  for (const c of clean) {
    const v = LOOKUP.get(c);
    if (v === undefined) throw new DecryptError();
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (value >> bits) & 0xff;
    }
  }
  return out;
}
