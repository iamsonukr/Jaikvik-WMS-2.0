'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Input, Select, Empty, Spinner, Button, SortableTh, PaginationControls, sortItems } from '@/components/ui';
import { ScrollText } from 'lucide-react';
import api from '@/lib/api';

const text = (value) => String(value || '').toLowerCase();
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';

export default function AuditLogsPage() {
  const [data, setData] = useState(null);
  const [action, setAction] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'createdAt', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const load = (p = page, nextLimit = limit) => api.get('/audit-logs', { params: { action: action || undefined, page: p, limit: nextLimit } })
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

  const sortedItems = useMemo(() => sortItems(filteredItems, sort, {
    action: (log) => log.action,
    actor: (log) => log.actorId?.name || log.actorId?.email || log.actorId,
    target: (log) => `${log.targetType || ''} ${log.targetId || ''}`,
    reason: (log) => log.reason,
    createdAt: (log) => log.createdAt,
  }), [filteredItems, sort]);
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.limit || limit)));
  const startItem = data?.total ? (((data.page || page) - 1) * (data.limit || limit)) + 1 : 0;
  const endItem = Math.min(data?.total || 0, (data?.page || page) * (data?.limit || limit));

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
                    <SortableTh label="Action" sortKey="action" sort={sort} onSort={setSort} />
                    <SortableTh label="Actor" sortKey="actor" sort={sort} onSort={setSort} />
                    <SortableTh label="Target" sortKey="target" sort={sort} onSort={setSort} />
                    <SortableTh label="Reason" sortKey="reason" sort={sort} onSort={setSort} />
                    <SortableTh label="Created" sortKey="createdAt" sort={sort} onSort={setSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!filteredItems.length && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit entries match these filters.</td></tr>
                  )}
                  {sortedItems.map((log) => (
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
          <PaginationControls
            page={data.page || page}
            totalPages={totalPages}
            pageSize={data.limit || limit}
            totalItems={data.total || 0}
            startItem={startItem}
            endItem={endItem}
            onPageChange={(nextPage) => load(nextPage)}
            onPageSizeChange={(nextLimit) => {
              setLimit(nextLimit);
              load(1, nextLimit);
            }}
          />
        </>
      )}
    </AppShell>
  );
}
