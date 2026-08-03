'use client';

import AppShell from '@/components/layout/AppShell';
import TemplatesWorkspace from '@/components/templates/TemplatesWorkspace';

export default function AdminTemplatesPage() {
  return (
    <AppShell allowedRoles={['admin']}>
      <TemplatesWorkspace />
    </AppShell>
  );
}
