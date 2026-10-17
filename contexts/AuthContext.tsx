import { AppState } from "react-native";
import { API_BASE_URL } from "../services/apiConfig";
import { authenticatedFetch, bindSessionTransport, revokeRemoteSession } from "../services/sessionTransport";
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
} from "../services/authStorage";
import { AuthSession, AuthUser } from "../types/auth";
import { selectItemAccount } from "../services/itemAccount";

type AuthContextValue = {
  session: AuthSession | null;
  isLoading: boolean;
  signIn: (session: AuthSession) => Promise<void>;
  signOut: (expectedSessionId?: string) => Promise<void>;
  updateUser: (token: string, user: AuthUser) => Promise<void>;
  replaceSession: (existingToken: string, nextSession: AuthSession) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const liveSession = useRef<AuthSession | null>(null);
  const sessionGeneration = useRef(0);
  const renewedTokens = useRef(new Set<string>());
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const persist = useCallback(<T,>(action: () => Promise<T>): Promise<T> => {
    const result = writes.current.then(action);
    writes.current = result.catch(() => undefined);
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    const generation = sessionGeneration.current;

    readAuthSession()
      .then((storedSession) => {
        if (active && generation === sessionGeneration.current) { selectItemAccount(storedSession); liveSession.current = storedSession; setSession(storedSession); }
      })
      .catch(() => {
        if (active && generation === sessionGeneration.current) { selectItemAccount(null); setSession(null); }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (nextSession: AuthSession) => {
    const generation = ++sessionGeneration.current;
    renewedTokens.current.clear();
    await persist(async () => {
      if (generation !== sessionGeneration.current) return;
      await writeAuthSession(nextSession);
      if (generation !== sessionGeneration.current) return;
      selectItemAccount(nextSession); liveSession.current = nextSession;
      setSession(nextSession);
    });
  }, [persist]);

  const signOut = useCallback(async (expectedSessionId?: string) => {
    if (expectedSessionId && liveSession.current?.sessionId !== expectedSessionId) return;
    const previous = liveSession.current;
    if (previous) void revokeRemoteSession(previous);
    ++sessionGeneration.current;
    renewedTokens.current.clear();
    selectItemAccount(null); liveSession.current = null;
    setSession(null);
    await persist(async () => {
      await clearAuthSession();
    });
  }, [persist]);

  const updateUser = useCallback(async (token: string, user: AuthUser) => {
    const generation = sessionGeneration.current;
    await persist(async () => {
      // A late profile response must never restore a logged-out/different session.
      if (generation !== sessionGeneration.current || (!liveSession.current || (liveSession.current.token !== token && !renewedTokens.current.has(token))) || liveSession.current?.user.id !== user.id) return;
      const next = { ...liveSession.current, user };
      await writeAuthSession(next);
      if (generation !== sessionGeneration.current) return;
      selectItemAccount(next); liveSession.current = next;
      setSession(next);
    });
  }, [persist]);

  const replaceSession = useCallback(async (existingToken: string, nextSession: AuthSession) => {
    const generation = sessionGeneration.current;
    return persist(async () => {
      if (generation !== sessionGeneration.current || liveSession.current?.token !== existingToken ||
          liveSession.current.user.id !== nextSession.user.id) return false;
      await writeAuthSession(nextSession);
      if (generation !== sessionGeneration.current) return false;
      if (nextSession.sessionId && nextSession.sessionId === liveSession.current?.sessionId) {
        renewedTokens.current.add(existingToken);
        if (renewedTokens.current.size > 16) renewedTokens.current.delete(renewedTokens.current.values().next().value!);
      } else renewedTokens.current.clear();
      selectItemAccount(nextSession); liveSession.current = nextSession;
      setSession(nextSession);
      return true;
    });
  }, [persist]);

  useEffect(() => bindSessionTransport({ current: () => liveSession.current, replace: replaceSession,
    invalidate: async token => { if (liveSession.current?.token === token) await signOut(); } }), [replaceSession, signOut]);
  useEffect(() => {
    const validate = () => {
      const current = liveSession.current;
      if (current) void authenticatedFetch(`${API_BASE_URL}/api/auth/sessions`, { method: "GET" }, current.token).catch(() => undefined);
    };
    if (!isLoading) validate();
    const listener = AppState.addEventListener("change", state => { if (state === "active") validate(); });
    return () => listener.remove();
  }, [isLoading]);

  const value = useMemo(
    () => ({ session, isLoading, signIn, signOut, updateUser, replaceSession }),
    [session, isLoading, signIn, signOut, updateUser, replaceSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
