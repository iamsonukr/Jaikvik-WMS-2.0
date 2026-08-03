'use client';

import AppShell from '@/components/layout/AppShell';
import TemplatesWorkspace from '@/components/templates/TemplatesWorkspace';

export default function AdminTemplateLibraryPage() {
  return (
    <AppShell allowedRoles={['admin']}>
      <TemplatesWorkspace mode="library" />
    </AppShell>
  );
}
