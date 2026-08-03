'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui';

export default function ClientClientDetailRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/master/dashboard');
  }, [router]);

  return (
    <AppShell allowedRoles={['master', 'admin']}>
      <div className="flex justify-center py-20">
        <Spinner size={32} />
      </div>
    </AppShell>
  );
}
