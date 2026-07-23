'use client';

import AppShell from '@/components/layout/AppShell';
import TemplatesWorkspace from '@/components/templates/TemplatesWorkspace';

export default function ClientTemplateLibraryPage() {
  return (
    <AppShell allowedRoles={['client_owner', 'client_user']}>
      <TemplatesWorkspace mode="library" />
    </AppShell>
  );
}
