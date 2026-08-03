'use client';

import AppShell from '@/components/layout/AppShell';
import TemplatesWorkspace from '@/components/templates/TemplatesWorkspace';

export default function ClientTemplateLibraryPage() {
  return (
    <AppShell allowedRoles={['master', 'admin']}>
      <TemplatesWorkspace mode="library" />
    </AppShell>
  );
}
