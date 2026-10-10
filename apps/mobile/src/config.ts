// App settings. EXPO_PUBLIC_* variables are read from apps/mobile/.env at build time.

export type StorageMode = 'local' | 'hybrid' | 'cloud';

function storageMode(value: string | undefined): StorageMode {
  return value === 'hybrid' || value === 'cloud' ? value : 'local';
}

export const config = {
  /** Our backend (Fastify). Processing always goes here; storage only when the cloud is on. */
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
  /**
   * local  – device only (today, until the cloud exists)
   * hybrid – device + background sync to AWS (target once the cloud is set up)
   * cloud  – cache only on device (shared kiosks where nothing may stay behind)
   * TODO(cloud): 'cloud' mode still keeps documents locally; add cache eviction on sign-out.
   */
  STORAGE_MODE: storageMode(process.env.EXPO_PUBLIC_STORAGE_MODE),
  /** TODO(cloud): set to true once the AWS setup checklist is done. */
  AWS_ENABLED: process.env.EXPO_PUBLIC_AWS_ENABLED === 'true',
};
