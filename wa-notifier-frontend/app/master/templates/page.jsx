'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, PageHeader, StatusBadge, Badge, Spinner, Empty } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import { RefreshCw, FileText } from 'lucide-react';

export default function TemplatesPage() {
  const { activeClient } = useClient();
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [syncing,   setSyncing]   = useState(false);
  const [syncError, setSyncError] = useState('');

  const load = () => {
    if (!activeClient) { setTemplates([]); return; }
    setLoading(true);
    api.get(`/templates?clientId=${activeClient._id}`)
      .then(r => setTemplates(r.data))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeClient]);

  const sync = async () => {
    if (!activeClient) return;
    setSyncing(true);
    setSyncError('');
    try {
      const { data } = await api.post(`/templates/sync/${activeClient._id}`);
      setTemplates(data);
    } catch (err) {
      setSyncError(
        err?.response?.data?.message ||
        'Could not sync templates from Meta. Check that the client\'s access token and WABA ID are correct.'
      );
    } finally { setSyncing(false); }
  };

  const getBodyText = (t) => t.components?.find(c => c.type === 'BODY')?.text || '';

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Templates"
        subtitle="Approved HSM templates from Meta"
        action={<Button onClick={sync} disabled={syncing || !activeClient} variant="outline"><RefreshCw size={15} className={syncing ? 'animate-spin' : ''}/>{syncing ? 'Syncing…' : 'Sync from Meta'}</Button>}
      />

      {!activeClient && (
        <div className="soft-alert border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 mb-5">
          Select a client first to view templates.
        </div>
      )}

      {syncError && (
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 mb-5">{syncError}</div>
      )}

      {loading && <div className="flex justify-center py-20"><Spinner size={32} /></div>}

      {!loading && templates.length === 0 && (
        <Empty icon={FileText} title="No templates" description="Sync templates from your Meta account to see them here." action={<Button onClick={sync}><RefreshCw size={14} />Sync Now</Button>} />
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map(t => (
            <Card key={t._id} className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-[var(--muted-text)] mt-0.5">{t.category} · {t.language}</p>
                </div>
                <StatusBadge status={t.status?.toLowerCase()} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2 line-clamp-3 bg-muted/70 rounded-lg p-2">
                {getBodyText(t) || 'No body text'}
              </p>
              <div className="mt-3 flex gap-1 flex-wrap">
                {t.components?.map(c => (
                  <Badge key={c.type} label={c.type} color="gray" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
