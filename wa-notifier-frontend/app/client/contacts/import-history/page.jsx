'use client';

import ContactImportHistoryWorkspace from '@/components/contacts/ContactImportHistoryWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function ClientContactImportHistoryPage() {
  return (
    <AppShell allowedRoles={['client_owner', 'client_user']}>
      <ContactImportHistoryWorkspace />
    </AppShell>
  );
}
