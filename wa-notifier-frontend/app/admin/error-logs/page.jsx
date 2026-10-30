'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Input, Empty, Spinner, Button, PaginationControls } from '@/components/ui';
import { Bug, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '-';

export default function ErrorLogsPage() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState('');

  const load = async (nextPage = page, nextLimit = limit) => {
    setError('');
    try {
      const response = await api.get('/error-logs', { params: { page: nextPage, limit: nextLimit } });
      setData(response.data);
      setPage(nextPage);
      setLimit(nextLimit);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load error logs.');
    }
  };

  useEffect(() => { load(1, 25); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.items || [];
    return (data?.items || []).filter((item) =>
      [item.message, item.context, item.path, item.method, item.statusCode]
        .some((value) => String(value || '').toLowerCase().includes(query)),
    );
  }, [data, search]);

  return (
    <AppShell allowedRoles={['admin']}>
      <PageHeader
        title="Error Logs"
        subtitle="Server errors and failures recorded by the application."
        action={<Button variant="outline" onClick={() => load()}><RefreshCw size={14} />Refresh</Button>}
      />
      <div className="mb-4 max-w-lg"><Input placeholder="Search message, route, or context..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {error && <div className="soft-alert mb-4 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">{error}</div>}
      {!data && error ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">Could not load error logs.</p>
          <Button variant="outline" onClick={() => load(1, 25)}><RefreshCw size={14} />Try again</Button>
        </Card>
      ) : !data ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data.items.length ? (
        <Empty icon={Bug} title="No error logs" description="Server errors and recorded webhook failures will appear here." />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Context</th><th className="px-4 py-3">Error</th><th className="px-4 py-3">Request</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!items.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No errors match this search.</td></tr>}
                  {items.map((item) => (
                    <tr key={item._id} className="align-top table-row-hover">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDateTime(item.createdAt)}</td>
                      <td className="px-4 py-3">{item.statusCode || '-'}</td>
                      <td className="px-4 py-3">{item.context || '-'}</td>
                      <td className="max-w-xl px-4 py-3">
                        <p className="whitespace-pre-wrap break-words">{item.message}</p>
                        {item.stack && <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Stack trace</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{item.stack}</pre></details>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.method && item.path ? `${item.method} ${item.path}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <PaginationControls
            page={data.page || page}
            totalPages={Math.max(1, Math.ceil((data.total || 0) / (data.limit || limit)))}
            pageSize={data.limit || limit}
            totalItems={data.total || 0}
            startItem={data.total ? ((data.page - 1) * data.limit) + 1 : 0}
            endItem={Math.min(data.total || 0, (data.page || page) * (data.limit || limit))}
            onPageChange={(nextPage) => load(nextPage)}
            onPageSizeChange={(nextLimit) => load(1, nextLimit)}
          />
        </>
      )}
    </AppShell>
  );
}
