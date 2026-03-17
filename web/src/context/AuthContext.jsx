import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { client, setUnauthorizedHandler, removeToken, setToken, getToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    removeToken();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    const bootstrap = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await client.get('/me');
        setUser(data);
      } catch {
        removeToken();
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  const loginSuccess = useCallback((token) => {
    setToken(token);
    return client.get('/me').then(({ data }) => setUser(data));
  }, []);

  const registerThenLogin = useCallback((token) => {
    setToken(token);
    return client.get('/me').then(({ data }) => setUser(data));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, loginSuccess, registerThenLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
