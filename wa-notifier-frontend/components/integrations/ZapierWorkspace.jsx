'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, KeyRound, RefreshCw, Zap } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { useClient } from '@/hooks/useClient';
import { Button, Input } from '@/components/ui';

const events = { 'contact.created': 'New contact', 'message.received': 'Incoming WhatsApp message', 'message.status_updated': 'Message delivery status' };
const panel = 'space-y-4 rounded-xl border border-border bg-card p-5';
const emptyHook = { name: '', event: 'message.received', url: '' };

function CopyValue({ label, value, secret = false }) {
  const [feedback, setFeedback] = useState('');
  return <div className="space-y-1.5"><p className="text-sm font-medium">{label}</p>
    <div className="flex items-center gap-2"><input aria-label={label} type={secret ? 'password' : 'text'} readOnly value={value}
      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs" />
      <Button size="sm" variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setFeedback('Copied'); }
        catch { setFeedback('Select and copy the value manually.'); }
      }}><Copy size={14} />Copy</Button></div>
    {feedback && <p role="status" className="text-xs text-muted-foreground">{feedback}</p>}
  </div>;
}

export default function ZapierWorkspace() {
  const { activeClient } = useClient();
  if (!activeClient) return <p className="p-6">Select a WhatsApp account to set up Zapier.</p>;
  return <ZapierAccount key={activeClient._id} account={activeClient} />;
}

function ZapierAccount({ account }) {
  const endpoint = `/integrations/zapier/${account._id}`;
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [hook, setHook] = useState(emptyHook);
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [action, setAction] = useState('message');
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const { data } = await api.get(endpoint);
    if (alive.current) setStatus(data);
  }, [endpoint]);
  useEffect(() => {
    alive.current = true;
    setApiBase(new URL(api.defaults.baseURL, window.location.origin).href.replace(/\/+$/, ''));
    refresh().catch(err => { if (alive.current) setError(getApiErrorMessage(err)); })
      .finally(() => { if (alive.current) setBusy(''); });
    const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 15000);
    return () => { alive.current = false; clearInterval(timer); };
  }, [refresh]);
  const run = async (name, task) => {
    setBusy(name); setError(''); setNotice('');
    try { await task(); }
    catch (err) { if (alive.current) setError(getApiErrorMessage(err, 'Could not complete this operation.')); }
    finally { if (alive.current) setBusy(''); }
  };
  const sample = action === 'message' ? {
    requestId: 'welcome-YOUR_SOURCE_EVENT_ID', phone: '+919876543210', templateName: 'your_approved_template', bodyParameters: ['Customer name'], consent: true,
  } : { requestId: 'contact-YOUR_SOURCE_EVENT_ID', phone: '+919876543210', name: 'Customer name' };
  const publicApi = apiBase.startsWith('https:') && !/\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(apiBase);
  const hookNames = Object.fromEntries((status?.hooks || []).map(item => [item._id, item.name]));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Zap size={25} />Zapier</h1>
      <p className="mt-1 text-sm text-muted-foreground">Connect other apps to WhatsApp workflows for {account.name} using Webhooks by Zapier.</p>
    </div><Button variant="outline" disabled={!!busy} onClick={() => run('refresh', refresh)}><RefreshCw size={15} />Refresh status</Button></div>
    {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-400/30 bg-green-500/10 p-3 text-sm">{notice}</p>}
    <p className="text-sm text-muted-foreground">In Zapier, choose <strong>Webhooks by Zapier</strong>. This connection does not require a published Jaikvik WMS app. Your Zapier plan must include the webhook features you use. <a href="https://help.zapier.com/hc/en-us/articles/8496083355661-How-to-get-started-with-Webhooks-by-Zapier" target="_blank" rel="noopener noreferrer" className="underline">Zapier setup guide</a></p>

    <section className={panel}><h2 className="font-semibold">1. Enable the connection</h2>
      <p className="text-sm">{status?.enabled ? `Enabled · API key ${status.keyHint || ''}` : 'Generate an API key for this WhatsApp account.'}</p>
      <p className="text-xs text-muted-foreground">This key can update contacts and send approved template messages for the selected account. Keep it private. Replacing it immediately invalidates the old key.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={!!busy || !status} onClick={() => run('key', async () => {
        const { data } = await api.post(`${endpoint}/key`);
        if (!alive.current) return;
        setApiKey(data.apiKey); setNotice('Copy the key now. WMS will not show it again.'); await refresh();
      })}><KeyRound size={15} />{status?.enabled ? 'Replace API key' : 'Generate API key'}</Button>
        {status?.enabled && <Button variant="outline" disabled={!!busy} onClick={() => run('disconnect', async () => {
          await api.delete(`${endpoint}/connection`); if (!alive.current) return;
          setApiKey(''); await refresh(); setNotice('Disconnected. API access is revoked and hooks are paused.');
        })}>Disconnect Zapier</Button>}</div>
      {apiKey && <CopyValue label="Your new API key — shown only now" value={apiKey} secret />}
      {status?.lastUsedAt && <p className="text-xs text-muted-foreground">Last API request: {new Date(status.lastUsedAt).toLocaleString()}</p>}
    </section>

    <section className={panel}><h2 className="font-semibold">2. Send data from another app to WMS</h2>
      {!publicApi && apiBase && <p className="rounded-lg bg-amber-500/10 p-3 text-sm">Zapier needs a publicly reachable HTTPS backend. The displayed API address is a local or HTTP address; ask your administrator to configure the production API address before connecting Zapier.</p>}
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Create a Zap with a trigger from your source app, such as a new lead or order.</li>
        <li>Add a <strong>Webhooks by Zapier → Custom Request</strong> action.</li>
        <li>Set the method to <strong>POST</strong>, use the URL below, and add headers <code>X-API-Key</code> with your WMS key and <code>Content-Type: application/json</code>.</li>
        <li>Use the JSON example below in Data and replace the example values with fields from the trigger. Keep Data Pass-Through off.</li>
      </ol>
      <label className="block space-y-1 text-sm"><span>WMS action</span><select value={action} onChange={e => setAction(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2">
        <option value="message">Send a WhatsApp template</option><option value="contact">Create or update a contact</option></select></label>
      <CopyValue label="Action URL" value={`${apiBase}/zapier/v1/${action === 'message' ? 'messages/template' : 'contacts'}`} />
      <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(sample, null, 2)}</pre>
      <p className="text-sm">Map <code>requestId</code> to a stable, unique event ID from the source app, with a prefix for this Zap step. Retries must keep the same ID and data. Reusing an ID with different data is rejected.</p>
      {action === 'message' ? <p className="text-xs text-muted-foreground">Use a template approved for this account and map body parameters in order. Set consent to the JSON boolean true only when you have permission to message that recipient. Opted-out and inactive contacts are blocked. Normal WhatsApp charges apply, including when testing a send action.</p>
        : <p className="text-xs text-muted-foreground">Use phone numbers with + and country code. You may also send tags (an array of existing WMS tags) and customFields (existing WMS field keys). Omitted fields are preserved; supplying tags replaces that contact’s tags. This action does not remove opt-outs.</p>}
      <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">Connection test and available templates</summary>
        <p className="text-sm">Use GET with the same X-API-Key header. These requests do not send WhatsApp messages.</p>
        <CopyValue label="Test authentication (GET)" value={`${apiBase}/zapier/v1/me`} />
        <CopyValue label="Supported approved templates (GET)" value={`${apiBase}/zapier/v1/templates`} />
      </details>
    </section>

    <section className={panel}><h2 className="font-semibold">3. Trigger a Zap from WMS</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm"><li>In a new Zap, choose <strong>Webhooks by Zapier → Catch Hook</strong> as the trigger.</li>
        <li>Copy its webhook URL, then save it below with the WMS event you want.</li><li>Click <strong>Send sample</strong>, then test the trigger in Zapier and configure the next action.</li></ol>
      <p className="text-xs text-muted-foreground">New events are collected approximately every minute. Status events contain the latest observed status, so intermediate statuses may be skipped. Enabling a hook starts from now; it does not backfill older events. Payloads include contact or message data for the selected event.</p>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); run('hook', async () => {
        await api.post(`${endpoint}/hooks`, hook); if (!alive.current) return; setHook(emptyHook); await refresh(); setNotice('Hook saved. Send a sample to test it in Zapier.');
      }); }}>
        <fieldset disabled={!!busy || !status?.enabled} className="grid gap-3 md:grid-cols-2">
          <Input label="Zap name" required maxLength={80} placeholder="Incoming messages to CRM" value={hook.name} onChange={e => setHook({ ...hook, name: e.target.value })} />
          <label className="space-y-1.5 text-sm"><span>Trigger event</span><select className="h-10 w-full rounded-lg border border-border bg-background px-3" value={hook.event} onChange={e => setHook({ ...hook, event: e.target.value })}>
            {Object.entries(events).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="md:col-span-2"><Input label="Zapier Catch Hook URL" type="url" required maxLength={500} placeholder="https://hooks.zapier.com/hooks/catch/.../.../" value={hook.url} onChange={e => setHook({ ...hook, url: e.target.value })} /></div>
          <div><Button type="submit" disabled={!!busy || !status?.enabled || status.hooks.length >= 10}>Save hook</Button></div>
        </fieldset>
      </form>
      {(status?.hooks || []).map(item => <article key={item._id} className="space-y-2 rounded-lg border border-border p-4">
        <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-medium">{item.name}</h3><p className="text-sm text-muted-foreground">{events[item.event]} · {item.enabled ? 'Enabled' : 'Paused'}</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy || !status.enabled || !item.enabled} onClick={() => run('test', async () => {
            await api.post(`${endpoint}/hooks/${item._id}/test`); await refresh(); setNotice('Sample queued. Delivery usually starts within 15 seconds. Check the log below and Test trigger in Zapier.');
          })}>Send sample</Button><Button size="sm" variant="outline" disabled={!!busy || !status.enabled} onClick={() => run('toggle', async () => {
            await api.patch(`${endpoint}/hooks/${item._id}`, { enabled: !item.enabled }); await refresh();
          })}>{item.enabled ? 'Pause' : 'Enable'}</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('remove', async () => {
            await api.delete(`${endpoint}/hooks/${item._id}`); await refresh();
          })}>Remove</Button></div></div>
        {item.lastError && <p className="text-sm text-red-500">{item.lastError}</p>}
        <p className="text-xs text-muted-foreground">Last event scan: {item.lastScannedAt ? new Date(item.lastScannedAt).toLocaleString() : 'Waiting for first scan'}</p>
      </article>)}
      <p className="text-xs text-muted-foreground">Samples contain artificial data and can run your Zap’s downstream actions. Use the payload’s test field to filter samples out of live workflows. To change a saved URL or event, remove the hook and add its replacement.</p>
    </section>

    <section className={panel}><h2 className="font-semibold">Recent webhook deliveries</h2>
      <p className="text-xs text-muted-foreground">Temporary failures retry automatically, up to six attempts. A delivery can reach Zapier more than once; use its event ID to prevent duplicate downstream work. Delivered means Zapier accepted the webhook, not that every later Zap step succeeded.</p>
      {!status?.deliveries?.length ? <p className="text-sm">No deliveries yet.</p> : <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Zap', 'Status', 'Attempts', 'Details', ''].map((label, i) => <th key={i} className="border-b p-2">{label}</th>)}</tr></thead>
        <tbody>{status.deliveries.map(item => <tr key={item._id}><td className="p-2">{hookNames[item.hookId] || 'Removed hook'}<p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p></td>
          <td className="p-2">{item.status}</td><td className="p-2">{item.attempts}</td><td className="p-2"><p>{item.lastError || (item.responseStatus ? `HTTP ${item.responseStatus}` : '')}</p><code className="text-xs break-all">{item.eventId}</code></td>
          <td className="p-2">{item.status === 'failed' && <Button size="sm" variant="outline" disabled={!!busy || !status.enabled} onClick={() => run('retry', async () => {
            await api.post(`${endpoint}/deliveries/${item._id}/retry`); await refresh(); setNotice('Delivery queued for retry with the same event ID.');
          })}>Retry</Button>}</td></tr>)}</tbody></table></div>}
    </section>
    <section className={panel}><h2 className="font-semibold">Recent actions from Zapier</h2>
      <p className="text-xs text-muted-foreground">If an action needs review or remains processing after an interruption, check Inbox and wallet before submitting a new request. WMS will not automatically repeat an uncertain send.</p>
      {!status?.actions?.length ? <p className="text-sm">No API actions yet.</p> : <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Request ID', 'Action', 'Status', 'Details'].map(label => <th className="border-b p-2" key={label}>{label}</th>)}</tr></thead>
        <tbody>{status.actions.map(item => <tr key={item._id}><td className="p-2 break-all">{item.requestId}</td><td className="p-2">{item.kind}</td><td className="p-2">{item.status}</td><td className="p-2">{item.error || new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
