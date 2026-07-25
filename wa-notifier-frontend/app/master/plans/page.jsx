'use client';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import PlanPurchasePanel from '@/components/billing/PlanPurchasePanel';
import { Button, PageHeader } from '@/components/ui';
import { Wallet } from 'lucide-react';

export default function ClientPlansPage() {
  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Plans"
        subtitle="Review available plans, compare pricing, and purchase or change your subscription."
        action={
          <Link href="/master/wallet">
            <Button variant="outline"><Wallet size={15} /> Wallet</Button>
          </Link>
        }
      />

      <PlanPurchasePanel />
    </AppShell>
  );
}
