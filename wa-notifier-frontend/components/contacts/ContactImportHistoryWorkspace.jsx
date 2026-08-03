'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import { Button, Card, Empty, Input, PageHeader, PaginationControls, Select, SortableTh, Spinner, sortItems, usePagination } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (value && typeof value === 'object') return [value];
  return [];
}

export default function ContactImportHistoryWorkspace() {
  const { activeClient } = useClient();
  const pathname = usePathname();
  const contactsHref = String(pathname || '/client/contacts/import-history').replace(/\/import-history\/?$/, '');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' });

  const load = useCallback(() => {
    if (!activeClient) {
      setHistory([]);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    api.get(`/contacts/import/history?whatsappAccountId=${activeClient._id}`)
      .then((res) => setHistory(asArray(res.data)))
      .catch((err) => {
        setHistory([]);
        setError(err?.response?.data?.message || 'Could not load import history.');
      })
      .finally(() => setLoading(false));
  }, [activeClient]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return history.filter((item) => {
      const hasIssues = Number(item.invalidRows || 0) > 0 || Number(item.skippedCount || 0) > 0;
      const matchesSearch = !query
        || String(item.fileName || '').toLowerCase().includes(query)
        || String(item._id || '').toLowerCase().includes(query);
      const matchesFilter = filter === 'all'
        || (filter === 'created' && Number(item.createdCount || 0) > 0)
        || (filter === 'updated' && Number(item.updatedCount || 0) > 0)
        || (filter === 'issues' && hasIssues);
      return matchesSearch && matchesFilter;
    });
  }, [filter, history, search]);

  const sorted = useMemo(() => sortItems(filtered, sort, {
    file: (item) => item.fileName,
    total: (item) => item.totalRows || 0,
    created: (item) => item.createdCount || 0,
    updated: (item) => item.updatedCount || 0,
    invalid: (item) => item.invalidRows || 0,
    skipped: (item) => item.skippedCount || 0,
    date: (item) => item.createdAt,
  }), [filtered, sort]);

  const historyPage = usePagination(sorted, {
    initialPageSize: 10,
    resetKey: `${search}|${filter}|${sort.key}|${sort.direction}`,
  });

  const totals = useMemo(() => ({
    imports: history.length,
    created: history.reduce((sum, item) => sum + Number(item.createdCount || 0), 0),
    updated: history.reduce((sum, item) => sum + Number(item.updatedCount || 0), 0),
    issues: history.reduce((sum, item) => sum + Number(item.invalidRows || 0) + Number(item.skippedCount || 0), 0),
  }), [history]);

  return (
    <>
      <PageHeader
        title="Import History"
        subtitle={activeClient ? `CSV import results for ${activeClient.name || activeClient._id}` : 'Select a client to view import history'}
        action={(
          <div className="flex flex-wrap gap-2">
            <Link href={contactsHref}>
              <Button variant="outline"><ArrowLeft size={14} />Contacts</Button>
            </Link>
            <Button variant="outline" onClick={load} disabled={!activeClient || loading}><RefreshCw size={14} />Refresh</Button>
          </div>
        )}
      />

      {!activeClient && (
        <div className="soft-alert mb-5 border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          Select a client first to view import history.
        </div>
      )}
      {error && <div className="soft-alert mb-5 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{error}</div>}

      {activeClient && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-4">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Imports</p><p className="mt-1 text-2xl font-bold">{totals.imports}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Created</p><p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totals.created}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Updated</p><p className="mt-1 text-2xl font-bold">{totals.updated}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Issues</p><p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{totals.issues}</p></Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_180px]">
              <Input placeholder="Search file name or import id..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All outcomes</option>
                <option value="created">Created rows</option>
                <option value="updated">Updated rows</option>
                <option value="issues">Has issues</option>
              </Select>
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><Spinner size={32} /></div>
            ) : !history.length ? (
              <Empty icon={FileText} title="No import history" description="Completed CSV imports will appear here." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <SortableTh label="File" sortKey="file" sort={sort} onSort={setSort} />
                        <SortableTh label="Rows" sortKey="total" sort={sort} onSort={setSort} align="right" />
                        <SortableTh label="Created" sortKey="created" sort={sort} onSort={setSort} align="right" />
                        <SortableTh label="Updated" sortKey="updated" sort={sort} onSort={setSort} align="right" />
                        <SortableTh label="Invalid" sortKey="invalid" sort={sort} onSort={setSort} align="right" />
                        <SortableTh label="Skipped" sortKey="skipped" sort={sort} onSort={setSort} align="right" />
                        <SortableTh label="Date" sortKey="date" sort={sort} onSort={setSort} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {!sorted.length && (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No imports match these filters.</td></tr>
                      )}
                      {historyPage.pageItems.map((item) => (
                        <tr key={item._id} className="table-row-hover">
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.fileName || 'contacts.csv'}</p>
                            <p className="font-mono text-xs text-muted-foreground">{item._id}</p>
                          </td>
                          <td className="px-4 py-3 text-right">{item.totalRows || 0}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{item.createdCount || 0}</td>
                          <td className="px-4 py-3 text-right">{item.updatedCount || 0}</td>
                          <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">{item.invalidRows || 0}</td>
                          <td className="px-4 py-3 text-right">{item.skippedCount || 0}</td>
                          <td className="px-4 py-3 text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN') : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationControls {...historyPage} onPageChange={historyPage.setPage} onPageSizeChange={historyPage.setPageSize} />
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
