'use client';

/**
 * Session state, held in localStorage.
 *
 * That was a deliberate choice for this project: no server-side session, no
 * cookie, no proxy route — the JWT lives in localStorage and every request
 * carries it. The trade-off is the usual one (a token in localStorage is readable
 * by any script on the page), accepted here in exchange for a frontend that is
 * entirely static and a backend that needs no CORS credentials handling.
 *
 * Strapi is configured in `legacy-support` JWT mode, so the token is long-lived
 * and there is no refresh flow to run.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as api from './api';
import { ApiError } from './strapi';
import type { Profile } from './types';

const STORAGE_KEY = 'cps-lms.jwt';

type AuthState = {
  /** `loading` until the stored token has been checked, so nothing flashes. */
  status: 'loading' | 'authenticated' | 'anonymous';
  token: string | null;
  user: Profile | null;
  signIn: (identifier: string, password: string) => Promise<Profile>;
  signUp: (username: string, email: string, password: string) => Promise<Profile>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Profile | null>(null);

  // localStorage is read in an effect, not in the initial state: this component
  // is prerendered on the server, where `window` does not exist, and seeding
  // state from it would produce a hydration mismatch.
  //
  // Even the "no stored token" answer is delivered through the promise chain
  // rather than set straight from the effect body, which would be a synchronous
  // setState in an effect — a cascading render, and a lint error under
  // `react-hooks/set-state-in-effect`. The extra microtask is not observable.
  useEffect(() => {
    let cancelled = false;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const check = stored ? api.getProfile(stored) : Promise.resolve(null);

    check
      .then((profile) => {
        if (cancelled) return;

        if (stored && profile) {
          setToken(stored);
          setUser(profile);
          setStatus('authenticated');
          return;
        }

        setStatus('anonymous');
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        // A rejected token is worth clearing; a backend that is merely down is
        // not — dropping the session on a connection blip would sign the user out
        // every time the API restarts.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          window.localStorage.removeItem(STORAGE_KEY);
        }

        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback(async (jwt: string) => {
    const profile = await api.getProfile(jwt);
    window.localStorage.setItem(STORAGE_KEY, jwt);
    setToken(jwt);
    setUser(profile);
    setStatus('authenticated');
    return profile;
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const { jwt } = await api.login(identifier, password);
      return adopt(jwt);
    },
    [adopt]
  );

  const signUp = useCallback(
    async (username: string, email: string, password: string) => {
      const { jwt } = await api.register(username, email, password);
      return adopt(jwt);
    },
    [adopt]
  );

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, token, user, signIn, signUp, signOut }),
    [status, token, user, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }

  return context;
}
