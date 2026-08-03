'use client';

import PaymentHistoryWorkspace from '@/components/payments/PaymentHistoryWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function PaymentsPage() {
  return (
    <AppShell allowedRoles={['master', 'admin']}>
      <PaymentHistoryWorkspace />
    </AppShell>
  );
}
