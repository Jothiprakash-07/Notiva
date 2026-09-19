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

type AuthContextValue = {
  session: AuthSession | null;
  isLoading: boolean;
  signIn: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (token: string, user: AuthUser) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const liveSession = useRef<AuthSession | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const persist = useCallback((action: () => Promise<void>) => {
    const result = writes.current.then(action);
    writes.current = result.catch(() => undefined);
    return result;
  }, []);

  useEffect(() => {
    let active = true;

    readAuthSession()
      .then((storedSession) => {
        if (active) { liveSession.current = storedSession; setSession(storedSession); }
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (nextSession: AuthSession) => {
    await persist(async () => {
      await writeAuthSession(nextSession);
      liveSession.current = nextSession;
      setSession(nextSession);
    });
  }, [persist]);

  const signOut = useCallback(async () => {
    await persist(async () => {
      await clearAuthSession();
      liveSession.current = null;
      setSession(null);
    });
  }, [persist]);

  const updateUser = useCallback(async (token: string, user: AuthUser) => {
    await persist(async () => {
      // A late profile response must never restore a logged-out/different session.
      if (liveSession.current?.token !== token || liveSession.current.user.id !== user.id) return;
      const next = { ...liveSession.current, user };
      await writeAuthSession(next);
      liveSession.current = next;
      setSession(next);
    });
  }, [persist]);

  const value = useMemo(
    () => ({ session, isLoading, signIn, signOut, updateUser }),
    [session, isLoading, signIn, signOut, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
