'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Input, Empty, Spinner, Button } from '@/components/ui';
import { ScrollText } from 'lucide-react';
import api from '@/lib/api';

export default function AuditLogsPage() {
  const [data, setData] = useState(null);
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const load = (p = page) => api.get('/audit-logs', { params: { action: action || undefined, page: p, limit: 25 } })
    .then((r) => { setData(r.data); setPage(p); });

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Audit logs"
        subtitle="Every staff action that touches money, access, or client status."
        action={
          <div className="flex gap-2">
            <Input placeholder="Filter by action (e.g. wallet.manual_credit)" value={action}
              onChange={(e) => setAction(e.target.value)} className="w-64" />
            <Button variant="outline" onClick={() => load(1)}>Filter</Button>
          </div>
        }
      />

      {!data ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data.items.length ? (
        <Empty icon={ScrollText} title="No audit entries" description="Actions like manual wallet adjustments will show up here." />
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-border">
              {data.items.map((log) => (
                <div key={log._id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium">{log.action}</p>
                    <p className="text-xs text-muted-foreground shrink-0">{new Date(log.createdAt).toLocaleString('en-IN')}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {log.targetType}{log.targetId ? ` · ${log.targetId}` : ''} — {log.reason || 'no reason given'}
                  </p>
                </div>
              ))}
            </div>
          </Card>
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">Page {data.page} · {data.total} total entries</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * data.limit >= data.total} onClick={() => load(page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
