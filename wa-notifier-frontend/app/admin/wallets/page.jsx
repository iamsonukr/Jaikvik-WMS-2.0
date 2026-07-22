'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Spinner, Empty } from '@/components/ui';
import { Wallet as WalletIcon } from 'lucide-react';
import api from '@/lib/api';

export default function WalletsOverviewPage() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    // No single "list all wallets" endpoint exists yet — this fetches each
    // tenant's balance individually. Fine at today's tenant counts; worth
    // a dedicated aggregate endpoint if the client list grows large.
    api.get('/tenants').then(async ({ data: tenants }) => {
      const withBalances = await Promise.all(
        tenants.map(async (t) => {
          try {
            const { data: balance } = await api.get(`/wallet/${t._id}`);
            return { tenant: t, balance };
          } catch {
            return { tenant: t, balance: null };
          }
        }),
      );
      setRows(withBalances);
    });
  }, []);

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Wallets" subtitle="Balance across every client." />

      {!rows ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !rows.length ? (
        <Empty icon={WalletIcon} title="No clients yet" />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-border">
            {rows.map(({ tenant, balance }) => (
              <Link key={tenant._id} href={`/admin/tenants/${tenant._id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent">
                <div>
                  <p className="text-sm font-medium">{tenant.name}</p>
                  <p className="text-xs text-muted-foreground">{tenant.contactEmail}</p>
                </div>
                <div className="flex gap-6 text-sm shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="font-semibold">₹{balance?.balance?.toLocaleString('en-IN') ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Recharged</p>
                    <p className="font-semibold">₹{balance?.totalRecharged?.toLocaleString('en-IN') ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Spent</p>
                    <p className="font-semibold">₹{balance?.totalSpent?.toLocaleString('en-IN') ?? '—'}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}
