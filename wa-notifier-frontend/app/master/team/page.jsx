'use client';

import TeamWorkspace from '@/components/team/TeamWorkspace';
import AppShell from '@/components/layout/AppShell';

export default function TeamPage() {
  return (
    <AppShell allowedRoles={['master', 'admin']}>
      <TeamWorkspace />
    </AppShell>
  );
}
