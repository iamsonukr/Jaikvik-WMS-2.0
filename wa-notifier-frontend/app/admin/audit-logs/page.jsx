'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Input, Select, Empty, Spinner, Button } from '@/components/ui';
import { ScrollText } from 'lucide-react';
import api from '@/lib/api';

const text = (value) => String(value || '').toLowerCase();
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';

export default function AuditLogsPage() {
  const [data, setData] = useState(null);
  const [action, setAction] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  const load = (p = page) => api.get('/audit-logs', { params: { action: action || undefined, page: p, limit: 25 } })
    .then((r) => { setData(r.data); setPage(p); });

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const targetTypeOptions = useMemo(() => {
    const values = (data?.items || []).map((log) => log.targetType).filter(Boolean);
    return Array.from(new Set(values)).sort();
  }, [data]);

  const filteredItems = useMemo(() => {
    const query = text(action.trim());
    return (data?.items || []).filter((log) => {
      const matchesQuery = !query
        || text(log.action).includes(query)
        || text(log.targetType).includes(query)
        || text(log.targetId).includes(query)
        || text(log.reason).includes(query)
        || text(log.actorId?.email).includes(query)
        || text(log.actorId?.name).includes(query);
      const matchesTargetType = targetTypeFilter === 'all' || log.targetType === targetTypeFilter;
      return matchesQuery && matchesTargetType;
    });
  }, [data, action, targetTypeFilter]);

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Audit logs"
        subtitle="Every staff action that touches money, access, or client status."
        action={
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[260px_180px_auto]">
            <Input placeholder="Search action, actor, target..." value={action} onChange={(e) => setAction(e.target.value)} />
            <Select value={targetTypeFilter} onChange={(e) => setTargetTypeFilter(e.target.value)}>
              <option value="all">All targets</option>
              {targetTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Action</th>
                    <th className="px-4 py-3 font-semibold">Actor</th>
                    <th className="px-4 py-3 font-semibold">Target</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!filteredItems.length && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit entries match these filters.</td></tr>
                  )}
                  {filteredItems.map((log) => (
                    <tr key={log._id} className="table-row-hover">
                      <td className="px-4 py-3 font-medium">{log.action}</td>
                      <td className="px-4 py-3">
                        <p>{log.actorId?.name || 'System'}</p>
                        <p className="text-xs text-muted-foreground">{log.actorId?.email || log.actorId || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{log.targetType || '-'}</p>
                        <p className="font-mono text-xs text-muted-foreground">{log.targetId || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-md truncate">{log.reason || 'No reason given'}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} - {data.total} total entries</p>
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
