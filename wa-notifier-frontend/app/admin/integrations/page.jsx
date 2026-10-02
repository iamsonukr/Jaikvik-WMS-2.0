'use client';
import AppShell from '@/components/layout/AppShell';
import IntegrationsWorkspace from '@/components/integrations/IntegrationsWorkspace';
export default function IntegrationsPage() {
  return <AppShell allowedRoles={['admin']}><IntegrationsWorkspace basePath="/admin" /></AppShell>;
}
