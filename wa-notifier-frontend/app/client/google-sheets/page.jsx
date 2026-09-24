'use client';
import AppShell from '@/components/layout/AppShell';
import GoogleSheetsWorkspace from '@/components/integrations/GoogleSheetsWorkspace';
export default function GoogleSheetsPage() {
  return <AppShell allowedRoles={['client_owner']}><GoogleSheetsWorkspace /></AppShell>;
}
