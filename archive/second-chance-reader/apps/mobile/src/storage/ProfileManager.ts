// Name + PIN profiles, entirely on the device (offline). Each profile has its own data
// key, locked by its PIN, so residents sharing a tablet can never read each other's papers.
//
//   createProfile(name, pin) – first use: "What's your name?" + "Pick a 4–6 number PIN"
//   login(name, pin)         – every time after
//
// Names are not secret and may repeat (two residents can both be "James Smith"); the PIN
// is what tells same-name profiles apart. The profile list stores only a hash of each name,
// so the device doesn't keep a readable list of who lives in the house. That hash hides
// names from a casual look, not from someone guessing common names.
//
// TODO(cloud): cross-device login (name + PIN on a new phone) belongs on the server, with
// attempt limits enforced there and keys held in KMS; never derive cloud keys from the PIN.
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { deleteOwnerData, type LocalBackend } from './LocalBackend';
import { KeyVault, assertPin, deriveKey, type VaultStore } from './KeyVault';
import { decryptJson, encryptJson, toBase64 } from './crypto';

const DIRECTORY_KEY = 'profiles';
const MAX_NAME_LENGTH = 60;
/** Profiles nobody has logged into for this long are removed, data and all. */
export const INACTIVE_PROFILE_DAYS = 180;

interface ProfileEntry {
  id: string;
  nameHash: string;
  displayName: string;   // encrypted with the profile's data key
  createdAt: string;
  lastLoginAt: string;
}

export interface Profile { id: string; displayName: string }
export interface Session { profile: Profile; dataKey: Uint8Array }

export class InvalidNameError extends Error {
  constructor() { super(`Name must be 1 to ${MAX_NAME_LENGTH} characters`); this.name = 'InvalidNameError'; }
}

/** Wrong name or PIN. attemptsLeft is set when a profile with that name exists. */
export class LoginFailedError extends Error {
  constructor(public readonly attemptsLeft?: number) {
    super("That name and PIN don't match");
    this.name = 'LoginFailedError';
  }
}

export class LockedOutError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many wrong PINs. Wait, then try again.');
    this.name = 'LockedOutError';
  }
}

export class NameAndPinTakenError extends Error {
  constructor() {
    super('Someone with that name already uses that PIN. Log in instead, or pick a different PIN.');
    this.name = 'NameAndPinTakenError';
  }
}

export function displayName(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function nameHash(name: string) {
  return toBase64(sha256(utf8ToBytes('scr-name-v1:' + displayName(name).toLowerCase())));
}

function assertName(name: string) {
  const n = displayName(name);
  if (!n || n.length > MAX_NAME_LENGTH) throw new InvalidNameError();
}

export class ProfileManager {
  constructor(
    private backend: LocalBackend,
    private vaultStoreFor: (profileId: string) => VaultStore,
    private iterations = 600_000,
    private now = () => Date.now(),
  ) {}

  private vault(id: string) {
    return new KeyVault(this.vaultStoreFor(id), this.iterations, this.now);
  }

  private async entries(): Promise<ProfileEntry[]> {
    const raw = await this.backend.getMeta(DIRECTORY_KEY);
    return raw ? JSON.parse(raw) as ProfileEntry[] : [];
  }

  private saveEntries(entries: ProfileEntry[]) {
    return this.backend.setMeta(DIRECTORY_KEY, JSON.stringify(entries));
  }

  /** How many profiles exist, so the first screen can show "Get started" or "Log in". */
  async count() {
    return (await this.entries()).length;
  }

  async createProfile(name: string, pin: string): Promise<Session> {
    assertName(name);
    assertPin(pin);
    const hash = nameHash(name);
    const all = await this.entries();
    for (const e of all.filter(e => e.nameHash === hash)) {
      if (await this.vault(e.id).tryUnlock(pin)) throw new NameAndPinTakenError();
    }

    const id = bytesToHex(randomBytes(16));
    const dataKey = await this.vault(id).setup(pin);
    const now = new Date(this.now()).toISOString();
    const profile = { id, displayName: displayName(name) };
    await this.saveEntries([...all, {
      id, nameHash: hash, displayName: encryptJson(dataKey, profile.displayName),
      createdAt: now, lastLoginAt: now,
    }]);
    return { profile, dataKey };
  }

  async login(name: string, pin: string): Promise<Session> {
    assertName(name);
    assertPin(pin);
    const all = await this.entries();
    const matches = all.filter(e => e.nameHash === nameHash(name));

    if (!matches.length) {
      // Same slow work as a real attempt, so timing doesn't reveal which names exist.
      await deriveKey(pin, new Uint8Array(16), this.iterations);
      throw new LoginFailedError();
    }

    const tried: KeyVault[] = [];
    const waits: number[] = [];
    for (const entry of matches) {
      const vault = this.vault(entry.id);
      const wait = await vault.lockedForMs();
      if (wait > 0) { waits.push(wait); continue; }
      tried.push(vault);
      const dataKey = await vault.tryUnlock(pin);
      if (dataKey) {
        entry.lastLoginAt = new Date(this.now()).toISOString();
        await this.saveEntries(all);
        return { profile: { id: entry.id, displayName: decryptJson<string>(dataKey, entry.displayName) }, dataKey };
      }
    }

    // No profile with this name took the PIN: count a miss against each one tried.
    const results = await Promise.all(tried.map(v => v.recordFailure()));
    const lockouts = [...waits, ...results.map(r => r.lockedForMs)].filter(ms => ms > 0);
    if (lockouts.length === matches.length) throw new LockedOutError(Math.min(...lockouts));
    throw new LoginFailedError(Math.min(...results.map(r => r.attemptsLeft)));
  }

  async changePin(session: Session, newPin: string) {
    await this.vault(session.profile.id).rewrap(session.dataKey, newPin);
  }

  /** "Delete my profile": removes the login and every document and file it owns. */
  async deleteProfile(session: Session) {
    await this.remove(session.profile.id);
  }

  /**
   * Removes profiles nobody has logged into for 180 days. This is also how a forgotten
   * PIN gets cleaned up: the resident makes a new profile (same name, new PIN), and the
   * old one, which nobody can open, is removed once it has sat unused long enough.
   * Nobody can delete another person's profile just by knowing their name.
   */
  async purgeInactive(days = INACTIVE_PROFILE_DAYS) {
    const cutoff = new Date(this.now() - days * 86_400_000).toISOString();
    const stale = (await this.entries()).filter(e => e.lastLoginAt < cutoff);
    for (const e of stale) await this.remove(e.id);
    return stale.length;
  }

  private async remove(id: string) {
    await deleteOwnerData(this.backend, id);
    await this.vault(id).clear();
    await this.saveEntries((await this.entries()).filter(e => e.id !== id));
  }
}
