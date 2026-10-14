'use client';
import AppShell from '@/components/layout/AppShell';
import ClientHelpCenter from '@/components/help/ClientHelpCenter';

export default function ClientHelpPage() {
  return <AppShell allowedRoles={['client_owner', 'client_user']}><ClientHelpCenter /></AppShell>;
}
