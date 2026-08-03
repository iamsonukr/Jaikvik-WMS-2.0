'use client';

import ContactsWorkspace from '@/components/contacts/ContactsWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function AdminContactsPage() {
  return (
    <AppShell allowedRoles={['admin']}>
      <ContactsWorkspace />
    </AppShell>
  );
}
