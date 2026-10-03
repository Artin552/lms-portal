import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshAccessToken, setAccessToken, setSessionExpiredHandler } from '../api/client';
import type { Role, SelfUser } from '../api/types';

interface AuthState {
  user: SelfUser | null;
  ready: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: SelfUser) => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SelfUser | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  // Восстановление сессии по refresh-cookie при загрузке страницы
  useEffect(() => {
    refreshAccessToken()
      .then(async (token) => {
        if (token) setUser((await api.get<SelfUser>('/auth/me')).data);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      qc.clear();
    });
  }, [qc]);

  const login = useCallback(async (loginName: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: SelfUser }>('/auth/login', { login: loginName, password });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      login,
      logout,
      setUser,
      hasRole: (...roles) => !!user && roles.includes(user.role),
    }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}

/** Текущий пользователь на страницах, которые доступны только после входа */
export function useMe(): SelfUser {
  const { user } = useAuth();
  if (!user) throw new Error('Пользователь не авторизован');
  return user;
}
