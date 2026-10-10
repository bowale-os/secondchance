import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientApi } from "../api";
import type { ClientLogin, ClientRead } from "../types";

const STORAGE_KEY = "client_session";
const EXPIRED = "Your session ended. Please log in again.";

interface Stored {
  token: string;
  expiresAt: number; // ms since epoch
}

const unauthenticated = createClientApi(async () => null);

function readStored(): Stored | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Stored | null;
    return s && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/**
 * Client (name + PIN) session. The token lives in sessionStorage so a refresh keeps the
 * client logged in, and it is dropped when the tab closes or the token expires.
 */
export function useClientSession() {
  const [session, setSession] = useState<Stored | null>(readStored);
  const [client, setClient] = useState<ClientRead | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const token = session?.token ?? null;

  const api = useMemo(() => createClientApi(async () => token), [token]);

  const end = useCallback((message: string | null) => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    setSession(null);
    setClient(null);
    setNotice(message);
  }, []);

  // Load the profile for the current token; a rejected token ends the session.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.auth
      .me()
      .then((c) => !cancelled && setClient(c))
      .catch(() => !cancelled && end(EXPIRED));
    return () => {
      cancelled = true;
    };
  }, [token, api, end]);

  // Log out when the token expires.
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => end(EXPIRED), Math.max(session.expiresAt - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [session, end]);

  /** Rejects with ApiError (401 wrong name/PIN, 429 locked out) so the form can show it. */
  const login = useCallback(async (body: ClientLogin) => {
    const res = await unauthenticated.auth.login(body);
    const stored = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      /* storage unavailable: the session still works until refresh */
    }
    setNotice(null);
    setSession(stored);
  }, []);

  const logout = useCallback(() => end(null), [end]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { api, isLoggedIn: session !== null, client, notice, login, logout, dismissNotice };
}
