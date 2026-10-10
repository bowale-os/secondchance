import { describe, expect, it } from 'vitest';
import {
  InvalidNameError, LockedOutError, LoginFailedError, NameAndPinTakenError, ProfileManager,
} from '../ProfileManager';
import { InvalidPinError } from '../KeyVault';
import { MemoryBackend } from '../backends/MemoryBackend';
import { metaVault } from '../vaultStores';
import { createStorage } from '../createStorage';
import { blobKey } from '../LocalBackend';
import { makeDoc } from './fixtures';

function setup() {
  let now = Date.UTC(2026, 9, 9);
  const backend = new MemoryBackend();
  const profiles = new ProfileManager(backend, id => metaVault(backend, id), 1_000, () => now);
  return { backend, profiles, advance: (ms: number) => { now += ms; } };
}

describe('ProfileManager (name + PIN, offline)', () => {
  it('creates a profile and logs back in with the same name and PIN', async () => {
    const { profiles } = setup();
    expect(await profiles.count()).toBe(0);
    const created = await profiles.createProfile('  Maria   Lopez ', '4821');
    expect(created.profile.displayName).toBe('Maria Lopez');

    const session = await profiles.login('maria lopez', '4821');   // case and spacing don't matter
    expect(session.profile).toEqual(created.profile);
    expect(session.dataKey).toEqual(created.dataKey);
  });

  it('keeps no readable names or PINs on the device', async () => {
    const { backend, profiles } = setup();
    await profiles.createProfile('Maria Lopez', '4821');
    const stored = [...backend.meta.values()].join();
    expect(stored.toLowerCase()).not.toContain('maria');
    expect(stored).not.toContain('4821');
  });

  it('gives the same answer for a wrong PIN and an unknown name', async () => {
    const { profiles } = setup();
    await profiles.createProfile('Maria Lopez', '4821');
    await expect(profiles.login('Maria Lopez', '0000')).rejects.toBeInstanceOf(LoginFailedError);
    await expect(profiles.login('Nobody Here', '4821')).rejects.toBeInstanceOf(LoginFailedError);
  });

  it('validates the name and PIN', async () => {
    const { profiles } = setup();
    await expect(profiles.createProfile('   ', '4821')).rejects.toBeInstanceOf(InvalidNameError);
    await expect(profiles.createProfile('Maria', '12')).rejects.toBeInstanceOf(InvalidPinError);
  });

  it('lets two people share a name, told apart by PIN', async () => {
    const { profiles } = setup();
    const a = await profiles.createProfile('James Smith', '1111');
    const b = await profiles.createProfile('James Smith', '2222');
    expect((await profiles.login('James Smith', '1111')).profile.id).toBe(a.profile.id);
    expect((await profiles.login('James Smith', '2222')).profile.id).toBe(b.profile.id);
    await expect(profiles.createProfile('James Smith', '1111')).rejects.toBeInstanceOf(NameAndPinTakenError);
  });

  it("one person's successful logins don't count against a same-name profile", async () => {
    const { profiles } = setup();
    await profiles.createProfile('James Smith', '1111');
    await profiles.createProfile('James Smith', '2222');
    for (let i = 0; i < 10; i++) await profiles.login('James Smith', '2222');
    await expect(profiles.login('James Smith', '1111')).resolves.toBeDefined();
  });

  it('locks out after 5 wrong PINs, then lets the right PIN in after the wait', async () => {
    const { profiles, advance } = setup();
    await profiles.createProfile('Maria Lopez', '4821');
    for (let left = 4; left >= 1; left--) {
      await expect(profiles.login('Maria Lopez', '0000')).rejects.toEqual(new LoginFailedError(left));
    }
    await expect(profiles.login('Maria Lopez', '0000')).rejects.toBeInstanceOf(LockedOutError);
    await expect(profiles.login('Maria Lopez', '4821')).rejects.toBeInstanceOf(LockedOutError);
    advance(30_001);
    await expect(profiles.login('Maria Lopez', '4821')).resolves.toBeDefined();
  });

  it('changes the PIN without losing documents', async () => {
    const { backend, profiles } = setup();
    const session = await profiles.createProfile('Maria Lopez', '4821');
    const storage = await createStorage({ mode: 'local', backend, ownerId: session.profile.id, dataKey: session.dataKey });
    await storage.documents.save(makeDoc({ ownerId: session.profile.id }));

    await profiles.changePin(session, '135790');
    const again = await profiles.login('Maria Lopez', '135790');
    const reopened = await createStorage({ mode: 'local', backend, ownerId: again.profile.id, dataKey: again.dataKey });
    expect((await reopened.documents.list()).items).toHaveLength(1);
  });

  it("keeps each resident's documents separate on a shared device", async () => {
    const { backend, profiles } = setup();
    const maria = await profiles.createProfile('Maria Lopez', '4821');
    const james = await profiles.createProfile('James Smith', '1111');
    const mariaStore = await createStorage({ mode: 'local', backend, ownerId: maria.profile.id, dataKey: maria.dataKey });
    const jamesStore = await createStorage({ mode: 'local', backend, ownerId: james.profile.id, dataKey: james.dataKey });

    const doc = await mariaStore.documents.save(makeDoc({ ownerId: maria.profile.id }));
    expect((await jamesStore.documents.list()).items).toHaveLength(0);
    expect(await jamesStore.documents.get(doc.id)).toBeNull();
    await expect(jamesStore.documents.save(doc)).rejects.toThrow('different profile');
  });

  it('delete my profile removes the login, documents, and files, and nobody else\'s', async () => {
    const { backend, profiles } = setup();
    const maria = await profiles.createProfile('Maria Lopez', '4821');
    const james = await profiles.createProfile('James Smith', '1111');
    for (const s of [maria, james]) {
      const store = await createStorage({ mode: 'local', backend, ownerId: s.profile.id, dataKey: s.dataKey });
      const doc = makeDoc({ ownerId: s.profile.id });
      const page = await store.local.putBlob(blobKey(s.profile.id, doc.id, 'page-1.jpg'), new Uint8Array([1]), 'image/jpeg');
      await store.documents.save({ ...doc, pages: [page] });
    }

    await profiles.deleteProfile(maria);
    await expect(profiles.login('Maria Lopez', '4821')).rejects.toBeInstanceOf(LoginFailedError);
    expect(await backend.listDocs(maria.profile.id)).toHaveLength(0);
    expect([...backend.blobs.keys()].some(k => k.includes(maria.profile.id))).toBe(false);

    expect(await backend.listDocs(james.profile.id)).toHaveLength(1);
    expect([...backend.blobs.keys()].some(k => k.includes(james.profile.id))).toBe(true);
    expect(await profiles.count()).toBe(1);
  });

  it('forgot PIN: a new profile with the same name works, and the old one is purged when unused', async () => {
    const { profiles, advance } = setup();
    await profiles.createProfile('Maria Lopez', '4821');    // PIN later forgotten
    advance(90 * 86_400_000);
    await profiles.createProfile('Maria Lopez', '5555');    // starts over
    advance(91 * 86_400_000);
    await profiles.login('Maria Lopez', '5555');            // keeps the new one active

    expect(await profiles.purgeInactive()).toBe(1);
    expect(await profiles.count()).toBe(1);
    await expect(profiles.login('Maria Lopez', '5555')).resolves.toBeDefined();
  });
});
