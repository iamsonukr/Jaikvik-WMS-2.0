'use client';

import ContactsWorkspace from '@/components/contacts/ContactsWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function ContactsPage() {
  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <ContactsWorkspace />
    </AppShell>
  );
}
