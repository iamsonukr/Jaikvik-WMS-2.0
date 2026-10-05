'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { useClient } from '@/hooks/useClient';
import { Button, Input } from '@/components/ui';

const panel = 'space-y-4 rounded-xl border border-border bg-card p-5';
const fields = { name: 'Guest name', event_name: 'Appointment name', start_time: 'Start time (guest timezone)', timezone: 'Guest timezone', location: 'Location / meeting link', cancel_url: 'Cancellation link', reschedule_url: 'Reschedule link' };
export default function CalendlyWorkspace() {
  const { activeClient } = useClient();
  if (!activeClient) return <p className="p-6">Select a WhatsApp account to connect Calendly.</p>;
  return <CalendlyAccount key={activeClient._id} account={activeClient} />;
}
function CalendlyAccount({ account }) {
  const endpoint = `/integrations/calendly/${account._id}`;
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  const refresh = useCallback(async (loadSettings = false) => {
    const { data } = await api.get(endpoint);
    if (!alive.current) return;
    setStatus(data);
    if (loadSettings) setSettings(data.settings);
  }, [endpoint]);
  useEffect(() => {
    alive.current = true;
    refresh(true).catch(err => { if (alive.current) setError(getApiErrorMessage(err)); })
      .finally(() => { if (alive.current) setBusy(''); });
    const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 15000);
    return () => { alive.current = false; clearInterval(timer); };
  }, [refresh]);
  const run = async (name, task) => {
    setBusy(name); setError(''); setNotice('');
    try { await task(); }
    catch (err) { if (alive.current) setError(getApiErrorMessage(err, 'Could not complete Calendly operation.')); }
    finally { if (alive.current) setBusy(''); }
  };
  const changeRule = (kind, changes) => setSettings(previous => ({ ...previous, [kind]: { ...previous[kind], ...changes } }));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><CalendarDays size={25} />Calendly</h1>
      <p className="mt-1 text-sm text-muted-foreground">Send appointment confirmations, cancellations and reminders for {account.name}.</p>
    </div><Button variant="outline" disabled={!!busy} onClick={() => run('refresh', () => refresh())}><RefreshCw size={15} />Refresh</Button></div>
    {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-green-500/10 p-3 text-sm">{notice}</p>}
    {status && !status.configured && <p className="rounded-lg bg-amber-500/10 p-3 text-sm">The administrator must configure the public HTTPS API URL and Calendly encryption key on the server.</p>}
    <section className={panel}><h2 className="font-semibold">1. Connect your Calendly account</h2>
      <p className="text-sm">{status?.connected ? `Connected to ${status.name || 'Calendly'}` : 'Use a Calendly personal access token. Only bookings hosted by that Calendly user are included.'}</p>
      <p className="text-xs text-muted-foreground">In Calendly, open Integrations & apps → API & webhooks and create a personal access token with user, scheduled-event and webhook access. Your Calendly account must support webhooks. WMS encrypts the token and does not display it again.</p>
      <a className="text-sm underline" href="https://developer.calendly.com/docs/authentication/how-to-authenticate-with-personal-access-tokens" target="_blank" rel="noopener noreferrer">Calendly token instructions</a>
      {!status?.connected && !status?.cleanupPending && <form className="space-y-3" onSubmit={e => { e.preventDefault(); run('connect', async () => {
        await api.post(`${endpoint}/connect`, { token }); if (!alive.current) return; setToken(''); await refresh(true); setNotice('Calendly connected. Configure your booking questions and notification templates below.');
      }); }}><Input label="Calendly personal access token" type="password" autoComplete="off" required minLength={10} maxLength={4000} value={token} onChange={e => setToken(e.target.value)} />
        <Button type="submit" disabled={!!busy || !status?.configured}>Connect Calendly</Button></form>}
      {(status?.connected || status?.cleanupPending) && <Button variant="outline" disabled={!!busy} onClick={() => run('disconnect', async () => {
        await api.delete(`${endpoint}/connection`); await refresh(true); if (alive.current) setNotice('Calendly disconnected. Queued notifications have been canceled.');
      })}>{status.cleanupPending ? 'Retry subscription cleanup' : 'Disconnect Calendly'}</Button>}
      {status?.cleanupPending && <p className="text-sm">Local automation is stopped. Retry cleanup before connecting another Calendly account.</p>}
    </section>
    {settings && <form className={panel} onSubmit={e => { e.preventDefault(); run('settings', async () => {
      await api.post(`${endpoint}/settings`, settings); await refresh(true); if (alive.current) setNotice('Settings saved for new booking events. Already queued notifications retain their original settings.');
    }); }}><h2 className="font-semibold">2. Map booking questions and WhatsApp templates</h2>
      <p className="text-sm text-muted-foreground">Add a phone question and an explicit WhatsApp consent question to your Calendly booking form. Copy their exact labels here. Blank phone question uses Calendly’s text reminder number. Numbers must include country code.</p>
      <fieldset disabled={!!busy || !status?.connected} className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2"><Input label="Phone question label" maxLength={300} value={settings.phoneQuestion} onChange={e => setSettings({ ...settings, phoneQuestion: e.target.value })} />
          <Input label="WhatsApp consent question label" required maxLength={300} value={settings.consentQuestion} onChange={e => setSettings({ ...settings, consentQuestion: e.target.value })} />
          <Input label="Exact answer that grants consent" required maxLength={300} value={settings.consentAnswer} onChange={e => setSettings({ ...settings, consentAnswer: e.target.value })} />
          <Input label="Reminder minutes before appointment" type="number" required min={5} max={10080} value={settings.reminderMinutes} onChange={e => setSettings({ ...settings, reminderMinutes: Number(e.target.value) })} /></div>
        {['confirmation', 'cancellation', 'reminder'].map(kind => {
          const rule = settings[kind];
          return <div className="space-y-3 rounded-lg border border-border p-4" key={kind}>
            <label className="flex items-center gap-2 text-sm font-medium capitalize"><input type="checkbox" checked={rule.enabled} onChange={e => changeRule(kind, { enabled: e.target.checked })} />{kind}</label>
            {rule.enabled && <><label className="block space-y-1 text-sm"><span>Approved template</span><select required value={rule.templateName} className="w-full rounded-lg border border-border bg-background p-2" onChange={e => {
              const template = status.templates.find(item => item.name === e.target.value);
              changeRule(kind, { templateName: e.target.value, parameters: Array(template?.count || 0).fill('name') });
            }}><option value="">Select template</option>{status.templates.map(item => <option key={item.name} value={item.name}>{item.name} ({item.language})</option>)}</select></label>
              {rule.parameters.map((field, i) => <label className="block space-y-1 text-sm" key={i}><span>Body parameter {i + 1}</span><select value={field} className="w-full rounded-lg border border-border bg-background p-2" onChange={e => changeRule(kind, { parameters: rule.parameters.map((value, j) => j === i ? e.target.value : value) })}>
                {Object.entries(fields).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</>}
          </div>;
        })}
        <Button type="submit" disabled={!!busy || !status?.connected}>Save notification settings</Button>
      </fieldset>
      <p className="text-xs text-muted-foreground">Notifications require a valid phone and matching consent answer. Inactive or opted-out contacts are skipped. Normal WhatsApp charges apply. Templates support numbered body parameters and static text headers/buttons. Cancellation also stops pending reminders; rescheduling is processed as cancellation plus a new booking.</p>
    </form>}
    <section className={panel}><h2 className="font-semibold">Recent bookings</h2>
      {!status?.bookings?.length ? <p className="text-sm">New bookings will appear here after connection. Older bookings are not imported.</p> : <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Guest', 'Appointment', 'Start', 'Status', 'Consent'].map(label => <th className="border-b p-2" key={label}>{label}</th>)}</tr></thead><tbody>
        {status.bookings.map(item => <tr key={item._id}><td className="p-2">{item.name}<p className="text-xs text-muted-foreground">{item.phone}</p></td><td className="p-2">{item.eventName}</td><td className="p-2">{item.startTime ? new Date(item.startTime).toLocaleString() : 'Awaiting event details'}</td><td className="p-2">{item.status}</td><td className="p-2">{item.consent ? 'Yes' : 'No'}</td></tr>)}
      </tbody></table></div>}
    </section>
    <section className={panel}><h2 className="font-semibold">Recent notification activity</h2>
      <p className="text-xs text-muted-foreground">Jobs run about every 15 seconds. Failed or uncertain WhatsApp sends require review in Inbox and wallet and are never automatically sent again. Disconnection cannot recall a send already in progress.</p>
      {!status?.jobs?.length ? <p className="text-sm">No activity yet.</p> : <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Action', 'Status', 'Scheduled', 'Details'].map(label => <th className="border-b p-2" key={label}>{label}</th>)}</tr></thead><tbody>
        {status.jobs.map(item => <tr key={item._id}><td className="p-2">{item.kind === 'ingest' ? 'Booking sync' : item.kind}</td><td className="p-2">{item.status}</td><td className="p-2">{new Date(item.dueAt).toLocaleString()}</td><td className="p-2">{item.error || (item.messageId ? 'Submitted to WhatsApp. See Inbox for delivery status.' : '')}</td></tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
