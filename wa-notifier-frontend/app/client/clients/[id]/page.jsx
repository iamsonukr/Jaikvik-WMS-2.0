'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useClient } from '@/hooks/useClient';
import { normalizeRole } from '@/lib/roles';

export default function ClientClientDetailRedirectPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { clients, loading: clientsLoading } = useClient();

  useEffect(() => {
    if (loading || clientsLoading || !user) return;

    const role = normalizeRole(user.role);
    const target = role === 'client_owner' && clients.length === 0
      ? '/client/connect-whatsapp'
      : '/client/dashboard';
    router.replace(target);
  }, [clients.length, clientsLoading, loading, router, user]);

  return (
    <AppShell allowedRoles={['client_owner', 'client_user']}>
      <div className="flex justify-center py-20">
        <Spinner size={32} />
      </div>
    </AppShell>
  );
}
