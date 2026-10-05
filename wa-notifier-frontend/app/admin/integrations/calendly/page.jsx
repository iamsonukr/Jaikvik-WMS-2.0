'use client';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import CalendlyWorkspace from '@/components/integrations/CalendlyWorkspace';
export default function CalendlyPage() {
  return <AppShell allowedRoles={['admin']}><div className="space-y-5"><Link className="text-sm underline" href="/admin/integrations">Back to Integrations</Link><CalendlyWorkspace /></div></AppShell>;
}
