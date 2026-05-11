import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import {
  getUser as readUser,
  setUser as persistUser,
  setTokens,
  clearAuth,
  type StoredUser,
} from '@/lib/auth-storage';
import type { AuthLoginResult } from '@/types/api';

interface AuthContextValue {
  user: StoredUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<StoredUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<StoredUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const u = readUser();
      if (u) setUserState(u);
    } catch {
      clearAuth();
    } finally {
      setLoading(false);
    }
  }, []);

  async function login(email: string, password: string): Promise<StoredUser> {
    const res = await api.post<AuthLoginResult>('/auth/login', { email, password });
    setTokens(res.data.accessToken, res.data.refreshToken);
    persistUser(res.data.user);
    setUserState(res.data.user);
    return res.data.user;
  }

  async function logout(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken });
      } catch {
        // best-effort
      }
    }
    clearAuth();
    setUserState(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
