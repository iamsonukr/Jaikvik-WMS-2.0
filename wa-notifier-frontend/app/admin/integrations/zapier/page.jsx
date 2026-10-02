'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import ZapierWorkspace from '@/components/integrations/ZapierWorkspace';
export default function ZapierPage() {
  return <AppShell allowedRoles={['admin']}>
    <div className="space-y-5">
      <Link href="/admin/integrations" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} />Back to Integrations
      </Link>
      <ZapierWorkspace />
    </div>
  </AppShell>;
}
