// Per-profile settings, encrypted with the profile's key like everything else.
import type { LocalStorageProvider } from '../storage/providers/LocalStorageProvider';
import { decryptJson, encryptJson } from '../storage/crypto';

export interface Settings {
  /** Output language for the simple version and the to-do list. */
  language: 'en' | 'es';
  /** Asked once on the Confirm screen; turns "within 72 hours of release" into a real date. */
  releaseDate: string | null;
  largeText: boolean;
  /** Log out after 5 minutes with no taps. On by default: many residents share devices. */
  autoLogout: boolean;
}

export const DEFAULT_SETTINGS: Settings = { language: 'en', releaseDate: null, largeText: false, autoLogout: true };

export const settingsKey = (ownerId: string) => `settings.${ownerId}`;

export async function loadSettings(local: LocalStorageProvider, ownerId: string, key: Uint8Array): Promise<Settings> {
  const raw = await local.getMeta(settingsKey(ownerId));
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...decryptJson<Partial<Settings>>(key, raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(local: LocalStorageProvider, ownerId: string, key: Uint8Array, s: Settings) {
  return local.setMeta(settingsKey(ownerId), encryptJson(key, s));
}
