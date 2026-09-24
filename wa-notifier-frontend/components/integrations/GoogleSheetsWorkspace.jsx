'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, RefreshCw, Link2, Unplug } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { useClient } from '@/hooks/useClient';
import { Button, Input } from '@/components/ui';

const defaults = {
  spreadsheetId: '', sheetId: 0, enabled: false, importContacts: true, exportLeads: false, exportReports: false,
  intervalMinutes: 15, phoneColumn: '', nameColumn: '', tagsColumn: '', customFields: {}, automation: 'off',
  consentColumn: '', dueColumn: '', statusColumn: '', templateName: '', parameterColumns: [],
};
const selectClass = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm';
const panelClass = 'rounded-xl border border-border bg-card p-5 space-y-4';

function ColumnSelect({ label, value, onChange, columns, optional = true }) {
  return <label className="block space-y-1.5 text-sm"><span>{label}</span>
    <select className={selectClass} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{optional ? 'Not mapped' : 'Choose a column'}</option>
      {value && !columns.includes(value) && <option value={value}>{value} (reload to verify)</option>}
      {columns.map(column => <option key={column} value={column}>{column}</option>)}
    </select></label>;
}

export default function GoogleSheetsWorkspace() {
  const { activeClient } = useClient();
  if (!activeClient) return <p className="p-6">Select a WhatsApp account to connect Google Sheets.</p>;
  return <SheetsAccount key={activeClient._id} account={activeClient} />;
}

function SheetsAccount({ account }) {
  const endpoint = `/google-sheets/${account._id}`;
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(defaults);
  const [saved, setSaved] = useState(JSON.stringify(defaults));
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [book, setBook] = useState(null);
  const [preview, setPreview] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  const popup = useRef(null);
  const dirty = saved !== JSON.stringify(form);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const refresh = useCallback(async (loadSettings = false) => {
    const { data } = await api.get(endpoint);
    if (!alive.current) return;
    setStatus(data);
    if (loadSettings) {
      const settings = { ...defaults, ...(data.settings || {}) };
      setForm(settings); setSaved(JSON.stringify(settings)); setSpreadsheetInput(settings.spreadsheetId);
    }
  }, [endpoint]);

  useEffect(() => {
    alive.current = true;
    setBusy('loading');
    Promise.all([refresh(true), api.get('/templates', { params: { whatsappAccountId: account._id } }),
      api.get('/contacts/custom-fields', { params: { whatsappAccountId: account._id } })])
      .then(([, templateResult, fieldResult]) => {
        if (!alive.current) return;
        setTemplates(templateResult.data.filter(item => item.status?.toUpperCase() === 'APPROVED'));
        setCustomFields(fieldResult.data);
      }).catch(err => { if (alive.current) setError(getApiErrorMessage(err, 'Could not load integration settings.')); })
      .finally(() => { if (alive.current) setBusy(''); });
    const receive = event => {
      const origin = new URL(api.defaults.baseURL, window.location.origin).origin;
      if (event.origin !== origin || event.source !== popup.current || event.data?.type !== 'wms-google-sheets') return;
      if (!event.data.success) { setError('Google connection was canceled or failed. Try connecting again.'); return; }
      setNotice('Google connected. Review your settings and save to enable syncing.');
      refresh(true).catch(err => setError(getApiErrorMessage(err)));
    };
    window.addEventListener('message', receive);
    return () => { alive.current = false; window.removeEventListener('message', receive); popup.current?.close(); };
  }, [account._id, refresh]);

  const run = async (label, task) => {
    setBusy(label); setError(''); setNotice('');
    try { await task(); } catch (err) { if (alive.current) setError(getApiErrorMessage(err, 'The operation failed. Please try again.')); }
    finally { if (alive.current) setBusy(''); }
  };
  const connect = () => {
    popup.current = window.open('about:blank', 'wms-google-sheets', 'width=620,height=760');
    if (!popup.current) { setError('Allow popups for WMS, then connect Google again.'); return; }
    run('connecting', async () => {
      try {
        const { data } = await api.post(`${endpoint}/connect`, {}, { withCredentials: true });
        if (popup.current && !popup.current.closed) popup.current.location.href = data.url;
      } catch (err) { popup.current?.close(); throw err; }
    });
  };
  const loadBook = () => run('opening', async () => {
    const spreadsheetId = spreadsheetInput.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || spreadsheetInput.trim();
    const { data } = await api.get(`${endpoint}/spreadsheet`, { params: { spreadsheetId } });
    if (!alive.current) return;
    const sheets = data.sheets.filter(sheet => sheet.sheetType === 'GRID');
    setBook({ ...data, sheets }); setPreview(null);
    const sameBook = form.spreadsheetId === spreadsheetId;
    setForm(previous => ({ ...previous, spreadsheetId,
      sheetId: sameBook && sheets.some(sheet => sheet.sheetId === previous.sheetId) ? previous.sheetId : sheets[0]?.sheetId ?? 0 }));
  });
  const loadColumns = () => run('previewing', async () => {
    const { data } = await api.post(`${endpoint}/preview`, { spreadsheetId: form.spreadsheetId, sheetId: Number(form.sheetId) });
    if (alive.current) setPreview(data);
  });
  const template = templates.find(item => item.name === form.templateName);
  const body = template?.components?.find(item => item.type?.toUpperCase() === 'BODY')?.text || '';
  const parameterCount = Math.max(0, ...Array.from(body.matchAll(/\{\{(\d+)\}\}/g), match => Number(match[1])));
  const columns = preview?.headers || [];
  const disabled = Boolean(busy) || status?.busy;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold flex items-center gap-2"><FileSpreadsheet size={25} />Google Sheets</h1>
        <p className="mt-1 text-sm text-muted-foreground">Contacts, WhatsApp automations, leads and reports for {account.name}.</p></div>
      <Button variant="outline" disabled={Boolean(busy)} onClick={() => run('refreshing', () => refresh())}><RefreshCw size={15} />Refresh status</Button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-green-400/30 bg-green-500/10 p-3 text-sm">{notice}</div>}
    {status && !status.configured && <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-sm">Google Sheets has not been configured on the server. The administrator needs to add the Google OAuth client credentials, callback URL, frontend origin and encryption key.</div>}
    <section className={panelClass}>
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">1. Connect Google</h2>
        <p className="mt-1 text-sm">{status?.connected ? 'Google is connected to this WhatsApp account.' : 'Connect the Google account that can edit your spreadsheet.'}</p></div>
        <div className="flex gap-2"><Button disabled={disabled || !status?.configured} onClick={connect}><Link2 size={15} />{status?.connected ? 'Reconnect Google' : 'Connect Google'}</Button>
          {status?.connected && <Button variant="outline" disabled={disabled} onClick={() => run('disconnecting', async () => {
            await api.delete(`${endpoint}/connection`); await refresh(true); setNotice('Disconnected. Automatic sync is stopped.');
          })}><Unplug size={15} />Disconnect</Button>}</div></div>
      <p className="text-xs text-muted-foreground">Google asks for permission to read and edit your spreadsheets. WMS uses the spreadsheet you select below. Disconnecting removes this WMS account’s saved access; you can also revoke access in your Google account.</p>
    </section>
    {status?.connected && <>
      <section className={panelClass}>
        <h2 className="font-semibold">2. Choose a spreadsheet and map its columns</h2>
        <div className="flex flex-wrap gap-2"><Input aria-label="Spreadsheet URL or ID" className="flex-1 min-w-64" placeholder="Paste a Google Sheets URL or spreadsheet ID" value={spreadsheetInput} onChange={e => setSpreadsheetInput(e.target.value)} />
          <Button variant="outline" disabled={disabled || !spreadsheetInput} onClick={loadBook}>Open spreadsheet</Button></div>
        {book && <div className="flex flex-wrap gap-3 items-end"><label className="text-sm space-y-1 flex-1"><span>{book.title} — source tab</span>
          <select className={selectClass} value={form.sheetId} onChange={e => { update('sheetId', Number(e.target.value)); setPreview(null); }}>
            {book.sheets.map(sheet => <option key={sheet.sheetId} value={sheet.sheetId}>{sheet.title}</option>)}
          </select></label><Button variant="outline" disabled={disabled} onClick={loadColumns}>Load columns and preview</Button></div>}
        {!book && form.spreadsheetId && <Button variant="outline" disabled={disabled} onClick={loadColumns}>Load saved tab columns</Button>}
        <p className="text-xs text-muted-foreground">Use unique column names in row 1, and phone numbers with country codes stored as plain text. Up to 5,000 rows and 100 columns. Duplicate phone rows are skipped.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <ColumnSelect label="Phone number *" value={form.phoneColumn} columns={columns} optional={false} onChange={value => update('phoneColumn', value)} />
          <ColumnSelect label="Contact name" value={form.nameColumn} columns={columns} onChange={value => update('nameColumn', value)} />
          <ColumnSelect label="Tags (comma separated)" value={form.tagsColumn} columns={columns} onChange={value => update('tagsColumn', value)} />
          {customFields.map(field => <ColumnSelect key={field.key} label={`Contact field: ${field.label}`} value={form.customFields[field.key]} columns={columns} onChange={value => {
            const next = { ...form.customFields }; if (value) next[field.key] = value; else delete next[field.key]; update('customFields', next);
          }} />)}
        </div>
        <p className="text-xs text-muted-foreground">Create custom fields in Contacts for lead status, salesperson, or next follow-up, then map their sheet columns here. Mapped values flow from Sheets into WMS; unmapped contact details are preserved.</p>
        {preview && <div className="overflow-auto"><p className="mb-2 text-sm">Preview: {preview.title} · {preview.totalRows} rows · showing up to 10</p>
          <table className="w-full text-xs"><thead><tr>{columns.map(column => <th key={column} className="border-b p-2 text-left whitespace-nowrap">{column}</th>)}</tr></thead>
            <tbody>{preview.rows.map(row => <tr key={row.rowNumber}>{columns.map(column => <td key={column} className="border-b p-2 max-w-64 truncate">{row.data[column]}</td>)}</tr>)}</tbody></table></div>}
      </section>
      <section className={panelClass}>
        <h2 className="font-semibold">3. Choose what to sync</h2>
        {[['importContacts', 'Import and update contacts from mapped columns'], ['exportLeads', 'Save inbound WhatsApp leads to a separate WMS Leads tab'],
          ['exportReports', 'Export campaign and outbound message results to a separate WMS Reports tab']].map(([key, label]) =>
          <label key={key} className="flex gap-2 items-start text-sm"><input type="checkbox" checked={form[key]} onChange={e => update(key, e.target.checked)} />{label}</label>)}
        <p className="text-xs text-muted-foreground">Leads include the latest inbound message and inbox assignment. You can edit Lead status, Next follow-up and Notes in the output tab; WMS preserves those columns. Reports refresh the latest 2,500 campaign and 2,500 outbound inbox records.</p>
      </section>
      <section className={panelClass}>
        <h2 className="font-semibold">4. Automate WhatsApp messages</h2>
        <label className="block text-sm space-y-1"><span>Trigger</span><select className={selectClass} value={form.automation} onChange={e => update('automation', e.target.value)}>
          <option value="off">Off — sync data only</option><option value="new_row">Once for each eligible phone number in this tab</option>
          <option value="due_date">Reminder when a row’s date and time is due</option></select></label>
        {form.automation !== 'off' && <>
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm">Enabling automatic sync can send messages to existing eligible rows on the first run. Normal WhatsApp charges apply. A row must have consent marked YES, TRUE or 1. Inactive and opted-out WMS contacts are skipped.</p>
          <div className="grid md:grid-cols-3 gap-4">
            <ColumnSelect label="Consent column *" value={form.consentColumn} columns={columns} optional={false} onChange={value => update('consentColumn', value)} />
            <ColumnSelect label="WMS message status column *" value={form.statusColumn} columns={columns} optional={false} onChange={value => update('statusColumn', value)} />
            {form.automation === 'due_date' && <ColumnSelect label="Reminder date and time *" value={form.dueColumn} columns={columns} optional={false} onChange={value => update('dueColumn', value)} />}
          </div>
          {form.automation === 'due_date' && <p className="text-xs text-muted-foreground">Store reminders as plain text with a timezone, for example 2026-10-01T10:00:00+05:30. Past-due rows also qualify. Changing the date creates a new reminder.</p>}
          <label className="block text-sm space-y-1"><span>Approved template *</span><select className={selectClass} value={form.templateName} onChange={e => {
            setForm(previous => ({ ...previous, templateName: e.target.value, parameterColumns: [] }));
          }}><option value="">Choose a template</option>{templates.map(item => <option key={item._id} value={item.name}>{item.name} ({item.language})</option>)}</select></label>
          <p className="text-xs text-muted-foreground">Supports text templates with numbered body parameters and static headers/buttons.</p>
          {body && <p className="rounded-lg bg-black/5 p-3 text-sm whitespace-pre-wrap">{body}</p>}
          <div className="grid md:grid-cols-3 gap-4">{Array.from({ length: Math.min(parameterCount, 30) }, (_, i) =>
            <ColumnSelect key={i} label={`Template {{${i + 1}}} *`} value={form.parameterColumns[i]} columns={columns} optional={false} onChange={value => {
              const next = Array.from({ length: parameterCount }, (_, j) => form.parameterColumns[j] || ''); next[i] = value; update('parameterColumns', next);
            }} />)}</div>
          <p className="text-xs text-muted-foreground">The status column is reserved for WMS. Repeated syncs do not resend the same phone/trigger. Failed or interrupted sends require review in Inbox; they are not retried automatically.</p>
        </>}
      </section>
      <section className={panelClass}>
        <h2 className="font-semibold">5. Save and run</h2>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => update('enabled', e.target.checked)} />Enable automatic sync and the selected message automation</label>
        <label className="block text-sm space-y-1 max-w-xs"><span>Sync interval (minutes)</span><Input type="number" min="5" max="1440" value={form.intervalMinutes} onChange={e => update('intervalMinutes', Number(e.target.value))} /></label>
        <p className="text-xs text-muted-foreground">When automatic sync is off, Sync now imports and exports data without sending messages. Delivery updates appear on the next sync.</p>
        <div className="flex flex-wrap gap-3"><Button disabled={disabled || !form.spreadsheetId || !form.phoneColumn} onClick={() => run('saving', async () => {
          await api.post(`${endpoint}/settings`, form); await refresh(true); setNotice('Google Sheets settings saved.');
        })}>Save settings</Button><Button variant="outline" disabled={disabled || dirty || !status.settings?.spreadsheetId} onClick={() => run('syncing', async () => {
          try { const { data } = await api.post(`${endpoint}/sync`, {}, { timeout: 600000 });
            setNotice(`Sync complete: ${data.imported} contacts updated, ${data.sent} messages sent, ${data.invalid} invalid rows, ${data.failed} sends need review.`);
          } finally { await refresh(); }
        })}><RefreshCw size={15} />{busy === 'syncing' ? 'Syncing…' : form.enabled && form.automation !== 'off' ? 'Sync now and run automation' : 'Sync now'}</Button>
          {dirty && <span className="text-xs self-center">Save changes before syncing.</span>}</div>
        <p className="text-sm">Last sync: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Not run yet'}{status.busy ? ' · Sync in progress' : ''}</p>
        {status.lastError && <p role="alert" className="text-sm text-red-500">{status.lastError}</p>}
        {status.lastResult && <div className="text-sm space-y-1"><p>{status.lastResult.rows} source rows · {status.lastResult.imported} contacts updated · {status.lastResult.sent} messages sent</p>
          {status.lastResult.leads && <p>Leads: {status.lastResult.leads.rows} rows in “{status.lastResult.leads.tab}”.</p>}
          {status.lastResult.reports && <p>Reports: {status.lastResult.reports.rows} rows in “{status.lastResult.reports.tab}”.</p>}
          {status.lastResult.warnings?.map(warning => <p key={warning}>{warning}</p>)}</div>}
      </section>
      <section className={panelClass}><h2 className="font-semibold">Recent automation attempts</h2>
        {!status.events?.length ? <p className="text-sm">No automation attempts yet.</p> : <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>
          {['Phone', 'Trigger', 'Attempt status', 'Created', 'Details'].map(label => <th className="p-2 text-left border-b" key={label}>{label}</th>)}</tr></thead><tbody>
          {status.events.map(event => <tr key={event._id}><td className="p-2">{event.phone}</td><td className="p-2">{event.trigger}</td><td className="p-2">{event.status === 'processing' ? 'Processing / review if interrupted' : event.status}</td>
            <td className="p-2 whitespace-nowrap">{new Date(event.createdAt).toLocaleString()}</td><td className="p-2">{event.error || 'Delivery status is available in Inbox and the sheet.'}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </div>;
}
