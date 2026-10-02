'use client';
import AppShell from '@/components/layout/AppShell';
import IntegrationsWorkspace from '@/components/integrations/IntegrationsWorkspace';
export default function IntegrationsPage() {
  return <AppShell allowedRoles={['client_owner']}><IntegrationsWorkspace basePath="/client" /></AppShell>;
}
