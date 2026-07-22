'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { Card, Button, PageHeader, StatCard, Spinner, StatusBadge } from '@/components/ui';
import api from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, UserCircle, FileText, Megaphone, Radio, Activity } from 'lucide-react';

export default function ClientDetailPage() {
  const { id } = useParams();
  const router  = useRouter();
  const [client,    setClient]    = useState(null);
  const [stats,     setStats]     = useState(null);
  const [templates, setTemplates] = useState([]);
  const [syncing,   setSyncing]   = useState(false);
  const [loading,   setLoading]   = useState(true);

  const [syncError, setSyncError] = useState('');
  const [webhookStatus, setWebhookStatus] = useState('');
  const [webhookError, setWebhookError] = useState('');
  const [subscribingWebhooks, setSubscribingWebhooks] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [checkingDiagnostics, setCheckingDiagnostics] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s, t] = await Promise.all([
        api.get(`/clients/${id}`),
        api.get(`/analytics/overview?clientId=${id}`),
        api.get(`/templates?clientId=${id}`),
      ]);
      setClient(c.data);
      setStats(s.data);
      setTemplates(t.data);
    } catch {
      setClient(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const sync = async () => {
    setSyncing(true);
    setSyncError('');
    try {
      const { data } = await api.post(`/templates/sync/${id}`);
      setTemplates(data);
    } catch (err) {
      setSyncError(err?.response?.data?.message || 'Could not sync templates from Meta. Check the access token and WABA ID.');
    } finally { setSyncing(false); }
  };

  const subscribeWebhooks = async () => {
    setSubscribingWebhooks(true);
    setWebhookStatus('');
    setWebhookError('');
    try {
      await api.post(`/clients/${id}/webhooks/subscribe`);
      setWebhookStatus('WABA webhook subscription confirmed. Send a WhatsApp message to this business number and check Inbox.');
    } catch (err) {
      setWebhookError(err?.response?.data?.message || 'Could not subscribe this WABA to webhooks. Check Meta permissions and access token.');
    } finally {
      setSubscribingWebhooks(false);
    }
  };

  const checkSendingStatus = async () => {
    setCheckingDiagnostics(true);
    setDiagnostics(null);
    setDiagnosticsError('');
    try {
      const { data } = await api.get(`/clients/${id}/sending-diagnostics`);
      setDiagnostics(data);
    } catch (err) {
      setDiagnosticsError(err?.response?.data?.message || 'Could not check sending status.');
    } finally {
      setCheckingDiagnostics(false);
    }
  };

  if (loading) return <AppShell allowedRoles={['admin', 'master']}><div className="flex justify-center py-20"><Spinner size={32} /></div></AppShell>;
  if (!client) return <AppShell allowedRoles={['admin', 'master']}><p className="text-[var(--muted-text)]">Client not found.</p></AppShell>;

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/master/clients"><Button variant="ghost" size="sm"><ArrowLeft size={14}/>Clients</Button></Link>
        <div>
          <h1 className="text-xl font-bold">{client.name}</h1>
          <p className="text-sm text-[var(--muted-text)]">{client.phone || client.phoneNumberId}</p>
        </div>
        <span className={`ml-auto text-xs px-2.5 py-1 rounded-full font-medium ${client.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {client.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Contacts"   value={stats.totalContacts}   icon={UserCircle}  color="#25D366" />
          <StatCard label="Campaigns"  value={stats.totalBroadcasts} icon={Megaphone}   color="#6366f1" />
          <StatCard label="Templates"  value={templates.length}      icon={FileText}    color="#3b82f6" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Connection info */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-sm">Connection Details</h3>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={checkSendingStatus} disabled={checkingDiagnostics}>
                <Activity size={13} />
                {checkingDiagnostics ? 'Checking...' : 'Check Sending'}
              </Button>
              <Button size="sm" variant="outline" onClick={subscribeWebhooks} disabled={subscribingWebhooks}>
                <Radio size={13} />
                {subscribingWebhooks ? 'Subscribing...' : 'Subscribe Webhooks'}
              </Button>
            </div>
          </div>
          {webhookStatus && (
            <div className="mb-4 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-300">{webhookStatus}</div>
          )}
          {webhookError && (
            <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{webhookError}</div>
          )}
          {diagnosticsError && (
            <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{diagnosticsError}</div>
          )}
          {diagnostics && (
            <div className="mb-4 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">Sending diagnostics</p>
              {diagnostics.error && <p className="mt-1 text-red-600 dark:text-red-300">{diagnostics.error}</p>}
              {diagnostics.phoneNumber && (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>Stored phone ID: <span className="font-mono text-foreground">{diagnostics.phoneNumber.id}</span></p>
                  <p>Display phone: <span className="font-mono text-foreground">{diagnostics.phoneNumber.display_phone_number || 'unknown'}</span></p>
                  <p>Platform: <span className="font-mono text-foreground">{diagnostics.phoneNumber.platform_type || 'unknown'}</span></p>
                  <p>Verification: <span className="font-mono text-foreground">{diagnostics.phoneNumber.code_verification_status || 'unknown'}</span></p>
                  <p>Quality: <span className="font-mono text-foreground">{diagnostics.phoneNumber.quality_rating || 'unknown'}</span></p>
                </div>
              )}
              {diagnostics.wabaPhoneNumbers?.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium text-foreground">WABA phone numbers</p>
                  {diagnostics.wabaPhoneNumbers.map(phone => (
                    <p key={phone.id} className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {phone.id} - {phone.display_phone_number || phone.verified_name || 'unknown'} - {phone.platform_type || 'unknown'} - {phone.code_verification_status || 'unknown'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <dl className="space-y-3">
            {[
              { label: 'WABA ID',         val: client.wabaId },
              { label: 'Phone Number ID', val: client.phoneNumberId },
              { label: 'Industry',        val: client.industry || '—' },
              { label: 'Timezone',        val: client.timezone || '—' },
            ].map(r => (
              <div key={r.label} className="flex justify-between text-sm">
                <dt className="text-[var(--muted-text)]">{r.label}</dt>
                <dd className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{r.val}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Templates */}
        <Card>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--dark-border)]">
            <h3 className="font-semibold text-sm">Templates ({templates.length})</h3>
            <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
          {syncError && (
            <div className="px-4 py-2 border-b border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 text-xs">{syncError}</div>
          )}
          <div className="divide-y divide-[var(--dark-border)] max-h-64 overflow-y-auto">
            {templates.length === 0 && <p className="text-sm text-[var(--muted-text)] p-4">No templates. Click Sync.</p>}
            {templates.map(t => (
              <div key={t._id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-[var(--muted-text)]">{t.category} · {t.language}</p>
                </div>
                <StatusBadge status={t.status?.toLowerCase()} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
