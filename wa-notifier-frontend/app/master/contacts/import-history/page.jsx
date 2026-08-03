'use client';

import ContactImportHistoryWorkspace from '@/components/contacts/ContactImportHistoryWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function ClientContactImportHistoryPage() {
  return (
    <AppShell allowedRoles={['master', 'admin']}>
      <ContactImportHistoryWorkspace />
    </AppShell>
  );
}
