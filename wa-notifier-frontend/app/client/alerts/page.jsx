'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, AlertTriangle, Bell, CheckCircle2, CreditCard, Megaphone, MessageCircle, RefreshCw, Wallet } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Badge, Button, Card, Empty, PageHeader, Select, Spinner } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

const severityColor = { critical: 'red', warning: 'yellow', info: 'blue' };
const sourceIcon = {
  wallet: Wallet,
  subscription: CreditCard,
  payment: CreditCard,
  whatsapp: MessageCircle,
  meta: MessageCircle,
  template: AlertTriangle,
  broadcast: Megaphone,
};

export default function ClientAlertsPage() {
  const { activeClient, loading: clientsLoading } = useClient();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [severity, setSeverity] = useState('all');
  const [source, setSource] = useState('all');

  const load = () => {
    if (!activeClient) { setAlerts([]); return; }
    setLoading(true);
    api.get(`/alerts?whatsappAccountId=${activeClient._id}`)
      .then((res) => setAlerts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeClient]);

  const sources = useMemo(() => Array.from(new Set(alerts.map((alert) => alert.source).filter(Boolean))).sort(), [alerts]);
  const filtered = useMemo(() => alerts.filter((alert) => {
    const matchesSeverity = severity === 'all' || alert.severity === severity;
    const matchesSource = source === 'all' || alert.source === source;
    return matchesSeverity && matchesSource;
  }), [alerts, severity, source]);

  const counts = useMemo(() => ({
    critical: alerts.filter((alert) => alert.severity === 'critical').length,
    warning: alerts.filter((alert) => alert.severity === 'warning').length,
    info: alerts.filter((alert) => alert.severity === 'info').length,
  }), [alerts]);

  return (
    <AppShell allowedRoles={['client_owner', 'client_user']}>
      <PageHeader
        title="Alerts"
        subtitle={activeClient ? `Priority notifications for ${activeClient.name}` : 'Select a WhatsApp account to view alerts'}
        action={<Button variant="outline" onClick={load} disabled={!activeClient || loading}><RefreshCw size={14} />Refresh</Button>}
      />

      {clientsLoading && <div className="flex justify-center py-20"><Spinner size={32} /></div>}

      {!clientsLoading && !activeClient && (
        <Empty
          icon={Bell}
          title="No WhatsApp account selected"
          description="Select or connect a WhatsApp account before viewing alerts."
          action={<Link href="/client/connect-whatsapp"><Button><MessageCircle size={15} />Connect WhatsApp</Button></Link>}
        />
      )}

      {activeClient && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{counts.critical}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Warnings</p>
              <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{counts.warning}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Info</p>
              <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{counts.info}</p>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[180px_180px_1fr]">
              <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </Select>
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="all">All sources</option>
                {sources.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
              <div className="flex items-center justify-end text-xs text-muted-foreground">{filtered.length} of {alerts.length} alerts</div>
            </div>

            {loading && <div className="flex justify-center py-20"><Spinner size={30} /></div>}

            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <CheckCircle2 className="text-emerald-500" size={34} />
                <p className="font-semibold">No alerts match these filters</p>
                <p className="max-w-sm text-sm text-muted-foreground">Your highest-priority wallet, subscription, WhatsApp, template, payment, and broadcast issues will appear here.</p>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="divide-y divide-border">
                {filtered.map((alert) => {
                  const Icon = sourceIcon[alert.source] || AlertCircle;
                  return (
                    <div key={alert.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        alert.severity === 'critical' ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : alert.severity === 'warning' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      }`}>
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{alert.title}</p>
                          <Badge label={alert.severity} color={severityColor[alert.severity] || 'gray'} />
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{alert.source}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                        {alert.createdAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                      {alert.actionHref && (
                        <Link href={alert.actionHref}>
                          <Button size="sm" variant={alert.severity === 'critical' ? 'default' : 'outline'}>Open</Button>
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
