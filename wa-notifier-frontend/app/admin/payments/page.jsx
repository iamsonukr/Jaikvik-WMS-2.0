'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Badge, Empty, Spinner } from '@/components/ui';
import { CreditCard } from 'lucide-react';
import api from '@/lib/api';

const STATUS_COLOR = { paid: 'green', created: 'yellow', failed: 'red' };

export default function PaymentsPage() {
  const [payments, setPayments] = useState(null);

  useEffect(() => { api.get('/payments').then((r) => setPayments(r.data)); }, []);

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Payments" subtitle="Every Razorpay payment recorded on the platform." />

      {!payments ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !payments.length ? (
        <Empty icon={CreditCard} title="No payments yet" description="Payments appear here once a client recharges their wallet." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-border">
            {payments.map((p) => (
              <div key={p._id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.tenantId?.name || 'Unknown client'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.razorpayOrderId} · {new Date(p.createdAt).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge label={p.purpose.replace('_', ' ')} color="blue" />
                  <span className="text-sm font-semibold">₹{p.amount.toLocaleString('en-IN')}</span>
                  <Badge label={p.status} color={STATUS_COLOR[p.status] || 'gray'} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  );
}
