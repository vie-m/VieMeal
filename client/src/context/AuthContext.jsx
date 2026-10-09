// Holds the logged-in user and exposes login / register / guest / logout.
// user.is_guest = true for "Continue as guest" sandbox accounts.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  // On page load: if we have a token, ask the server who we are.
  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      setUser(await api.get('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('viemeal:logout', onLogout);
    return () => window.removeEventListener('viemeal:logout', onLogout);
  }, []);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };
  const register = async (full_name, email, password) => {
    const data = await api.post('/auth/register', { full_name, email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };
  // Creates a private guest account with sample data (no email needed).
  const loginAsGuest = async () => {
    const data = await api.post('/auth/guest');
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };
  // Turns the current guest into a real account. All guest data is kept.
  const upgrade = async (full_name, email, password) => {
    const data = await api.post('/auth/upgrade', { full_name, email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };
  const logout = () => { setToken(null); setUser(null); };
  const markProfileDone = () => setUser((u) => (u ? { ...u, has_profile: true } : u));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginAsGuest, upgrade, logout, refresh, markProfileDone }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
