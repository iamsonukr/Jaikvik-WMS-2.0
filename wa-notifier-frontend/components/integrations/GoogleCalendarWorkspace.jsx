'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { useClient } from '@/hooks/useClient';
import { Button, Input } from '@/components/ui';

const defaults = { calendarId: 'primary', enabled: false, reminderMinutes: 60, templateName: '', parameters: [] };
const fields = ['name', 'event_name', 'start_time', 'timezone', 'location'];
const panel = 'rounded-xl border border-border bg-card p-5 space-y-4';
const select = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm';
export default function GoogleCalendarWorkspace() {
  const { activeClient } = useClient();
  if (!activeClient) return <p className="p-6">Select a WhatsApp account to connect Google Calendar.</p>;
  return <CalendarAccount key={activeClient._id} id={activeClient._id} />;
}
function CalendarAccount({ id }) {
  const endpoint = `/google-calendar/${id}`;
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(defaults);
  const [calendars, setCalendars] = useState([]);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const alive = useRef(true), popup = useRef(null);
  const refresh = useCallback(async () => {
    const { data } = await api.get(endpoint);
    if (!alive.current) return;
    setStatus(data); setForm({ ...defaults, ...data.settings });
    if (data.connected) {
      const result = await api.get(`${endpoint}/calendars`);
      if (alive.current) setCalendars(result.data);
    } else { setCalendars([]); setEvents([]); }
  }, [endpoint]);
  const run = async task => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { if (alive.current) setError(getApiErrorMessage(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    alive.current = true;
    refresh().catch(e => { if (alive.current) setError(getApiErrorMessage(e)); });
    const receive = event => {
      const origin = new URL(api.defaults.baseURL, window.location.origin).origin;
      if (event.origin !== origin || event.source !== popup.current || event.data?.type !== 'wms-google-calendar') return;
      if (!event.data.success) { setError('Google connection failed or was canceled.'); return; }
      run(async () => { await refresh(); if (alive.current) setNotice('Google Calendar connected. Configure reminders below.'); });
    };
    window.addEventListener('message', receive);
    return () => { alive.current = false; window.removeEventListener('message', receive); popup.current?.close(); };
  }, [refresh]);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const template = status?.templates?.find(t => t.name === form.templateName);
  const loadEvents = async () => {
    const { data } = await api.get(`${endpoint}/events`, { params: { calendarId: form.calendarId } });
    if (alive.current) setEvents(data);
  };
  return <div className="space-y-5">
    <h1 className="flex items-center gap-2 text-2xl font-semibold"><CalendarDays size={25} />Google Calendar</h1>
    <p className="text-sm text-muted-foreground">Connect a calendar and send WhatsApp appointment reminders. Upcoming timed appointments and recurring occurrences are supported.</p>
    {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-green-500/10 p-3 text-sm">{notice}</p>}
    {status && !status.configured && <p className={panel}>The administrator must configure Google Calendar OAuth credentials, callback URL, frontend origin and encryption key on the server.</p>}
    <section className={panel}><h2 className="font-semibold">1. Connect Google Calendar</h2>
      <p>{status?.connected ? 'Google Calendar connected' : 'Authorize read access to your Google calendars.'}</p>
      <Button disabled={busy || !status?.configured} onClick={() => {
        popup.current = window.open('about:blank', 'wms-google-calendar', 'width=620,height=760');
        if (!popup.current) { setError('Allow popups for WMS, then try again.'); return; }
        run(async () => {
          try { const { data } = await api.post(`${endpoint}/connect`, {}, { withCredentials: true });
            if (alive.current && popup.current && !popup.current.closed) popup.current.location.href = data.url;
          } catch (e) { popup.current?.close(); throw e; }
        });
      }}>{status?.connected ? 'Reconnect Google' : 'Connect Google'}</Button>
      {status?.connected && <Button variant="outline" disabled={busy} onClick={() => run(async () => {
        await api.delete(`${endpoint}/connection`); await refresh();
      })}>Disconnect</Button>}
    </section>
    {status?.connected && <>
      <form className={panel} onSubmit={e => { e.preventDefault(); run(async () => {
        await api.post(`${endpoint}/settings`, form); await refresh(); if (alive.current) setNotice('Reminder settings saved.');
      }); }}>
        <h2 className="font-semibold">2. Configure reminders</h2>
        <label className="block text-sm">Calendar<select className={select} value={form.calendarId} onChange={e => { update('calendarId', e.target.value); setEvents([]); }}>
          <option value="primary">Primary calendar</option>{calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <Input label="Minutes before appointment" type="number" min={5} max={10080} required value={form.reminderMinutes} onChange={e => update('reminderMinutes', Number(e.target.value))} />
        <label className="block text-sm">WhatsApp template<select className={select} value={form.templateName} onChange={e => {
          const t = status.templates.find(t => t.name === e.target.value);
          setForm(previous => ({ ...previous, templateName: e.target.value, parameters: Array(t?.count || 0).fill('name') }));
        }}><option value="">Choose a template</option>{status.templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select></label>
        {Array.from({ length: template?.count || 0 }, (_, i) => <label key={i} className="block text-sm">Parameter {i + 1}
          <select className={select} value={form.parameters[i] || 'name'} onChange={e => update('parameters', form.parameters.map((v, n) => n === i ? e.target.value : v))}>
            {fields.map(field => <option key={field} value={field}>{field.replaceAll('_', ' ')}</option>)}
          </select></label>)}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => update('enabled', e.target.checked)} />Enable WhatsApp reminders</label>
        <p className="text-xs text-muted-foreground">Reminders are checked every minute. Changes and cancellations are checked against Google before sending. Empty mapped fields prevent sending.</p>
        <Button type="submit" disabled={busy || (form.enabled && !template)}>Save settings</Button>
      </form>
      <section className={panel}><h2 className="font-semibold">3. Link appointments to WhatsApp recipients</h2>
        <p className="text-sm text-muted-foreground">Load the next eight days, enter a number including country code, and confirm consent. All-day events are excluded. Each recurring occurrence needs its own recipient.</p>
        <Button disabled={busy} onClick={() => run(loadEvents)}>Load upcoming appointments</Button>
        {events.map(event => <Recipient key={`${form.calendarId}:${event.id}`} event={event} disabled={busy} save={recipient => run(async () => {
          await api.post(`${endpoint}/recipient`, { calendarId: form.calendarId, eventId: event.id, ...recipient });
          await loadEvents(); if (alive.current) setNotice('Appointment recipient saved.');
        })} />)}
        {!events.length && <p className="text-sm text-muted-foreground">No appointments loaded.</p>}
      </section>
    </>}
    <section className={panel}><div className="flex items-center justify-between"><h2 className="font-semibold">Recent reminders</h2><Button variant="outline" disabled={busy} onClick={() => run(refresh)}>Refresh status</Button></div>
      {status?.lastError && <p className="text-sm text-red-600">{status.lastError}</p>}
      {status?.deliveries?.map(d => <div key={d._id} className="border-t border-border pt-2 text-sm"><span>{d.eventName || 'Appointment'} · {d.status}</span>{d.error && <p>{d.error}</p>}</div>)}
      {!status?.deliveries?.length && <p className="text-sm text-muted-foreground">No reminders sent yet.</p>}
    </section>
  </div>;
}
function Recipient({ event, disabled, save }) {
  const [phone, setPhone] = useState(event.recipient?.phone || '');
  const [name, setName] = useState(event.recipient?.name || '');
  const [consent, setConsent] = useState(event.recipient?.consent || false);
  return <form className="space-y-3 border-t border-border pt-4" onSubmit={e => { e.preventDefault(); save({ phone, name, consent }); }}>
    <p className="font-medium">{event.name}</p><p className="text-sm">{new Date(event.start.dateTime).toLocaleString()} (your local time)</p>
    <Input label="Recipient name" maxLength={200} value={name} onChange={e => setName(e.target.value)} />
    <Input label="WhatsApp number" required maxLength={100} placeholder="+919876543210" value={phone} onChange={e => setPhone(e.target.value)} />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Recipient agreed to WhatsApp appointment reminders</label>
    <Button type="submit" variant="outline" disabled={disabled}>Save recipient</Button>
  </form>;
}
