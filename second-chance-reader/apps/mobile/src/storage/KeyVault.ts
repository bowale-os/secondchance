// One profile's key lock. A random data key encrypts that profile's documents; the key
// is stored only in "wrapped" form, encrypted with a key derived from the profile's PIN.
// The PIN is never stored. The unwrapped key lives in memory only while logged in.
//
// Limits, stated honestly: a 4–6 digit PIN has at most a million combinations. The
// attempt limit below stops someone guessing through the app, and on phones the wrapped
// key sits in the hardware-backed keystore. On the web, someone who copies the browser's
// data could still try every PIN offline; slow key derivation makes that take hours, not
// seconds. That is a real improvement over a key stored in the open, not a guarantee.
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { decryptBytes, encryptBytes, fromBase64, generateKey, toBase64 } from './crypto';
import { DecryptError } from './errors';

export const PIN_PATTERN = /^\d{4,6}$/;
export const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 3_600_000;

/** Where one profile's wrapped key is kept: SecureStore on phones, the IndexedDB meta table on the web. */
export interface VaultStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
}

interface VaultRecord {
  v: 1;
  salt: string;
  iterations: number;
  wrappedKey: string;
  failedAttempts: number;
  lockedUntil: number;     // epoch ms
}

export class InvalidPinError extends Error {
  constructor() { super('PIN must be 4 to 6 numbers'); this.name = 'InvalidPinError'; }
}

/** PBKDF2-SHA256. Uses the platform's fast native WebCrypto when present (web, Node). */
export async function deriveKey(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  const pinBytes = new TextEncoder().encode(pin);
  if (subtle) {
    const base = await subtle.importKey('raw', pinBytes, 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, 256);
    return new Uint8Array(bits);
  }
  return pbkdf2Async(sha256, pinBytes, salt, { c: iterations, dkLen: 32 });
}

export function assertPin(pin: string) {
  if (!PIN_PATTERN.test(pin)) throw new InvalidPinError();
}

export class KeyVault {
  /**
   * @param iterations PBKDF2 rounds for new PINs. 600,000 on the web (OWASP 2023);
   *   phones without native WebCrypto use fewer, since the pure-JS fallback is slow and the
   *   wrapped key is already inside the hardware keystore.
   */
  constructor(private store: VaultStore, private iterations = 600_000, private now = () => Date.now()) {}

  async exists() {
    return (await this.store.get()) !== null;
  }

  /** New profile: creates the data key, locks it with the PIN, returns it unlocked. */
  async setup(pin: string): Promise<Uint8Array> {
    assertPin(pin);
    const dataKey = generateKey();
    await this.write(await this.wrap(dataKey, pin));
    return dataKey;
  }

  /** Milliseconds until another attempt is allowed (0 = allowed now). */
  async lockedForMs() {
    return Math.max(0, (await this.read()).lockedUntil - this.now());
  }

  /**
   * Returns the data key if the PIN is right, or null. Does not count a miss, so a caller
   * trying several same-name profiles only records a failure when none of them match.
   */
  async tryUnlock(pin: string): Promise<Uint8Array | null> {
    const record = await this.read();
    const kek = await deriveKey(pin, fromBase64(record.salt), record.iterations);
    try {
      const dataKey = decryptBytes(kek, fromBase64(record.wrappedKey));
      if (record.failedAttempts) await this.write({ ...record, failedAttempts: 0, lockedUntil: 0 });
      return dataKey;
    } catch (e) {
      if (e instanceof DecryptError) return null;
      throw e;
    }
  }

  /** Counts a wrong PIN. After 5 misses: wait 30 s, then 1 min, 2 min, 4 min… capped at 1 hour. */
  async recordFailure(): Promise<{ attemptsLeft: number; lockedForMs: number }> {
    const record = await this.read();
    const failedAttempts = record.failedAttempts + 1;
    const over = failedAttempts - FREE_ATTEMPTS;
    const lockedForMs = over >= 0 ? Math.min(BASE_LOCKOUT_MS * 2 ** over, MAX_LOCKOUT_MS) : 0;
    await this.write({ ...record, failedAttempts, lockedUntil: lockedForMs ? this.now() + lockedForMs : 0 });
    return { attemptsLeft: Math.max(0, FREE_ATTEMPTS - failedAttempts), lockedForMs };
  }

  /** Re-locks the same data key under a new PIN (no documents need re-encrypting). */
  async rewrap(dataKey: Uint8Array, newPin: string) {
    assertPin(newPin);
    await this.write(await this.wrap(dataKey, newPin));
  }

  clear() { return this.store.clear(); }

  private async wrap(dataKey: Uint8Array, pin: string): Promise<VaultRecord> {
    const salt = randomBytes(16);
    const kek = await deriveKey(pin, salt, this.iterations);
    return {
      v: 1, salt: toBase64(salt), iterations: this.iterations,
      wrappedKey: toBase64(encryptBytes(kek, dataKey)),
      failedAttempts: 0, lockedUntil: 0,
    };
  }

  private async read(): Promise<VaultRecord> {
    const raw = await this.store.get();
    if (!raw) throw new Error('This profile has no PIN');
    return JSON.parse(raw) as VaultRecord;
  }

  private write(record: VaultRecord) { return this.store.set(JSON.stringify(record)); }
}
