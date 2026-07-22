'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const ClientCtx = createContext(null);

export function ClientProvider({ children }) {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshClients = useCallback(async (preferredClientId) => {
    if (!user) {
      setClients([]);
      setActiveClient(null);
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      const { data } = await api.get('/clients');
      setClients(data);

      const stored = localStorage.getItem('wa_active_client');
      const found = data.find(c => c._id === preferredClientId)
        || data.find(c => c._id === stored)
        || data[0]
        || null;

      setActiveClient(found);
      if (found) localStorage.setItem('wa_active_client', found._id);
      else localStorage.removeItem('wa_active_client');

      return data;
    } catch {
      setClients([]);
      setActiveClient(null);
      localStorage.removeItem('wa_active_client');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshClients();
  }, [refreshClients]);

  const selectClient = (client) => {
    setActiveClient(client);
    localStorage.setItem('wa_active_client', client._id);
  };

  return (
    <ClientCtx.Provider value={{ clients, activeClient, loading, refreshClients, selectClient, setClients }}>
      {children}
    </ClientCtx.Provider>
  );
}

export const useClient = () => useContext(ClientCtx);
