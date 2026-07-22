'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';
import { normalizeRole } from '@/lib/roles';

const AuthCtx = createContext(null);

function normalizeUser(user) {
  if (!user) return user;
  return { ...user, role: normalizeRole(user.role) };
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('wa_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(r => setUser(normalizeUser(r.data)))
      .catch(() => localStorage.removeItem('wa_token'))
      .finally(() => setLoading(false));
  }, []);

  const setSession = (data) => {
    localStorage.setItem('wa_token', data.access_token);
    setUser(normalizeUser(data.user));
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setSession(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('wa_token');
    setUser(null);
    window.location.href = '/login';
  };

  return <AuthCtx.Provider value={{ user, loading, login, logout, setSession }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
