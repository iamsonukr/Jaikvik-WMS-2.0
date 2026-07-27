'use client';

import PaymentHistoryWorkspace from '@/components/payments/PaymentHistoryWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function PaymentsPage() {
  return (
    <AppShell allowedRoles={['client_owner', 'client_user']}>
      <PaymentHistoryWorkspace />
    </AppShell>
  );
}
