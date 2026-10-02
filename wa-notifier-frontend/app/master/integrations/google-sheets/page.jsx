'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import GoogleSheetsWorkspace from '@/components/integrations/GoogleSheetsWorkspace';
export default function GoogleSheetsPage() {
  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <div className="space-y-5">
        <Link href="/master/integrations" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} />Back to Integrations
        </Link>
        <GoogleSheetsWorkspace />
      </div>
    </AppShell>
  );
}
