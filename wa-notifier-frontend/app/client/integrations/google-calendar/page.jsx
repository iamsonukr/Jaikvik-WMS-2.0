'use client';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import GoogleCalendarWorkspace from '@/components/integrations/GoogleCalendarWorkspace';
export default function GoogleCalendarPage() {
  return <AppShell allowedRoles={['client_owner']}><div className="space-y-5"><Link className="text-sm underline" href="/client/integrations">Back to Integrations</Link><GoogleCalendarWorkspace /></div></AppShell>;
}

