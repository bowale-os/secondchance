// App settings. EXPO_PUBLIC_* variables are read from apps/mobile/.env at build time.
import Constants from 'expo-constants';

export type StorageMode = 'local' | 'hybrid' | 'cloud';

const API_PORT = 8787;

function storageMode(value: string | undefined): StorageMode {
  return value === 'hybrid' || value === 'cloud' ? value : 'local';
}

/**
 * Where our backend is. In development, a phone or emulator can't use "localhost" (that
 * would be the phone itself), so use the same computer that is serving the app to Expo Go.
 * Production builds must set EXPO_PUBLIC_API_URL.
 */
export function apiUrl(env = process.env.EXPO_PUBLIC_API_URL, hostUri = Constants.expoConfig?.hostUri) {
  if (env) return env;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:${API_PORT}` : `http://localhost:${API_PORT}`;
}

export const config = {
  /** Our backend (Fastify). Processing always goes here; storage only when the cloud is on. */
  API_URL: apiUrl(),
  /**
   * local  – device only (today, until the cloud exists)
   * hybrid – device + background sync to AWS (target once the cloud is set up)
   * cloud  – cache only on device (shared kiosks where nothing may stay behind)
   * TODO(cloud): 'cloud' mode still keeps documents locally; add cache eviction on sign-out.
   */
  STORAGE_MODE: storageMode(process.env.EXPO_PUBLIC_STORAGE_MODE),
  /** TODO(cloud): set to true once the AWS setup checklist is done. */
  AWS_ENABLED: process.env.EXPO_PUBLIC_AWS_ENABLED === 'true',

  /**
   * Resource Map place data. 'sample' = bundled fake places (today); 'api' = the places backend.
   * TODO(backend): switch to 'api' and set PLACES_API_URL once the backend exists.
   */
  PLACES_SOURCE: (process.env.EXPO_PUBLIC_PLACES_SOURCE === 'api' ? 'api' : 'sample') as 'sample' | 'api',
  PLACES_API_URL: process.env.EXPO_PUBLIC_PLACES_API_URL ?? '',
  /** Base map style URL (Amazon Location Service). Empty = county outlines only, no tiles. */
  MAP_STYLE_URL: process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? '',
};
