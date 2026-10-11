import { describe, expect, it } from 'vitest';
import { InvalidPinError, KeyVault } from '../KeyVault';
import { MemoryBackend } from '../backends/MemoryBackend';
import { metaVault } from '../vaultStores';
import { decryptJson, encryptJson } from '../crypto';

// Low iteration count keeps tests fast; production uses 600,000.
function setup() {
  let now = 1_000_000;
  const backend = new MemoryBackend();
  const vault = new KeyVault(metaVault(backend, 'p1'), 1_000, () => now);
  return { backend, vault, advance: (ms: number) => { now += ms; } };
}

describe('KeyVault (one profile\'s key lock)', () => {
  it('unlocks the same data key with the right PIN, and never stores the key or PIN', async () => {
    const { vault, backend } = setup();
    expect(await vault.exists()).toBe(false);
    const key = await vault.setup('4821');
    expect(await vault.exists()).toBe(true);
    const ct = encryptJson(key, 'parole paper');
    expect(decryptJson(await vault.tryUnlock('4821') as Uint8Array, ct)).toBe('parole paper');
    expect(await vault.tryUnlock('0000')).toBeNull();

    const stored = [...backend.meta.values()].join();
    expect(stored).not.toContain('4821');
    expect(stored).not.toContain(Buffer.from(key).toString('base64'));
  });

  it('rejects PINs that are not 4–6 digits', async () => {
    const { vault } = setup();
    for (const pin of ['12', '12ab', '1234567']) await expect(vault.setup(pin)).rejects.toThrow(InvalidPinError);
  });

  it('locks out after 5 misses with doubling waits, and a right PIN resets the count', async () => {
    const { vault, advance } = setup();
    await vault.setup('4821');
    for (let left = 4; left >= 1; left--) {
      expect(await vault.recordFailure()).toEqual({ attemptsLeft: left, lockedForMs: 0 });
    }
    expect(await vault.recordFailure()).toEqual({ attemptsLeft: 0, lockedForMs: 30_000 });
    expect(await vault.lockedForMs()).toBe(30_000);
    advance(30_001);
    expect((await vault.recordFailure()).lockedForMs).toBe(60_000);
    advance(60_001);

    expect(await vault.tryUnlock('4821')).toBeInstanceOf(Uint8Array);
    expect(await vault.recordFailure()).toEqual({ attemptsLeft: 4, lockedForMs: 0 });
  });

  it('rewraps the same data key under a new PIN', async () => {
    const { vault } = setup();
    const key = await vault.setup('4821');
    await vault.rewrap(key, '135790');
    expect(await vault.tryUnlock('135790')).toEqual(key);
    expect(await vault.tryUnlock('4821')).toBeNull();
  });
});
