// Who is logged in, and their open storage. The profile's data key lives only here, in
// memory; logging out (or 5 idle minutes) drops it, and the data can't be read again
// without the name + PIN.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ProfileManager, type Session } from '../storage/ProfileManager';
import { createStorage, type Storage } from '../storage/createStorage';
import { createPlatformStorage } from '../storage/platform';
import { config } from '../config';
import { stopSpeaking } from '../tts/speech';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';

export const IDLE_LOGOUT_MS = 5 * 60 * 1000;

interface ActiveSession {
  profile: Session['profile'];
  storage: Storage;
  settings: Settings;
}

interface SessionApi {
  ready: boolean;
  hasProfiles: boolean;
  active: ActiveSession | null;
  login(name: string, pin: string): Promise<void>;
  createProfile(name: string, pin: string): Promise<void>;
  logout(): void;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  changePin(currentPin: string, newPin: string): Promise<void>;
  deleteProfile(): Promise<void>;
  /** Call on any tap or key press to push back the idle logout. */
  touch(): void;
}

const Ctx = createContext<SessionApi | null>(null);

export function useSession() {
  const api = useContext(Ctx);
  if (!api) throw new Error('useSession must be inside <SessionProvider>');
  return api;
}

/** For screens that only render while logged in. */
export function useActiveSession() {
  const { active, ...rest } = useSession();
  if (!active) throw new Error('No one is logged in');
  return { ...active, ...rest };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const platform = useMemo(createPlatformStorage, []);
  const profiles = useMemo(
    () => new ProfileManager(platform.backend, platform.vaultStoreFor, platform.pinIterations),
    [platform],
  );
  const [ready, setReady] = useState(false);
  const [hasProfiles, setHasProfiles] = useState(false);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const keyRef = useRef<Session | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      await platform.backend.init();
      await profiles.purgeInactive();          // forgotten-PIN profiles unused for 180 days
      setHasProfiles((await profiles.count()) > 0);
      setReady(true);
    })();
  }, [platform, profiles]);

  const open = useCallback(async (session: Session) => {
    const storage = await createStorage({
      mode: config.STORAGE_MODE,
      backend: platform.backend,
      ownerId: session.profile.id,
      dataKey: session.dataKey,
      // TODO(cloud): pass `cloud` options here once AWS_ENABLED.
    });
    await storage.documents.purgeDeleted();
    const settings = await loadSettings(storage.local, session.profile.id, session.dataKey);
    keyRef.current = session;
    setHasProfiles(true);
    setActive({ profile: session.profile, storage, settings });
  }, [platform]);

  const logout = useCallback(() => {
    void stopSpeaking();
    keyRef.current = null;
    setActive(null);
  }, []);

  const touch = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (active?.settings.autoLogout) idleTimer.current = setTimeout(logout, IDLE_LOGOUT_MS);
  }, [active?.settings.autoLogout, logout]);

  useEffect(() => {
    touch();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [touch]);

  const api: SessionApi = {
    ready,
    hasProfiles,
    active,
    login: async (name, pin) => open(await profiles.login(name, pin)),
    createProfile: async (name, pin) => open(await profiles.createProfile(name, pin)),
    logout,
    touch,
    async updateSettings(patch) {
      const session = keyRef.current;
      if (!session || !active) return;
      const settings = { ...active.settings, ...patch };
      await saveSettings(active.storage.local, session.profile.id, session.dataKey, settings);
      setActive({ ...active, settings });
    },
    async changePin(currentPin, newPin) {
      const session = keyRef.current;
      if (!session) return;
      await profiles.login(session.profile.displayName, currentPin);   // confirms the current PIN
      await profiles.changePin(session, newPin);
    },
    async deleteProfile() {
      const session = keyRef.current;
      if (!session) return;
      await profiles.deleteProfile(session);
      setHasProfiles((await profiles.count()) > 0);
      logout();
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export { DEFAULT_SETTINGS };
