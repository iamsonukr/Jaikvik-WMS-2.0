'use client';

import ContactsWorkspace from '@/components/contacts/ContactsWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function ContactsPage() {
  return (
    <AppShell allowedRoles={['client_owner', 'client_user']}>
      <ContactsWorkspace />
    </AppShell>
  );
}
