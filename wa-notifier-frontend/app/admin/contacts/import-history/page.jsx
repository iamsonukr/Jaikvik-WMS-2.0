'use client';

import ContactImportHistoryWorkspace from '@/components/contacts/ContactImportHistoryWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function AdminContactImportHistoryPage() {
  return (
    <AppShell allowedRoles={['admin']}>
      <ContactImportHistoryWorkspace />
    </AppShell>
  );
}
