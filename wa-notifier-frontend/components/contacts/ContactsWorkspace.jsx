'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import { Plus, Search, Send, Trash2, Upload } from 'lucide-react';

const blank = { name: '', phone: '', tags: '' };

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (value && typeof value === 'object') return [value];
  return [];
}

function normalizeContact(contact) {
  return {
    ...contact,
    _id: contact?._id || contact?.id,
    name: contact?.name || '',
    phone: String(contact?.phone || ''),
    tags: Array.isArray(contact?.tags) ? contact.tags : [],
  };
}

function bodyText(template) {
  return template?.components?.find((component) => component?.type === 'BODY')?.text || '';
}

function bodyPlaceholderCount(template) {
  const matches = [...bodyText(template).matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

export default function ContactsWorkspace() {
  const { activeClient } = useClient();
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [formError, setFormError] = useState('');
  const [csvError, setCsvError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [messageModal, setMessageModal] = useState(false);
  const [messageContact, setMessageContact] = useState(null);
  const [messageMode, setMessageMode] = useState('template');
  const [messageText, setMessageText] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [templateParams, setTemplateParams] = useState([]);
  const [messageError, setMessageError] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const fileRef = useRef();

  const approvedTemplates = useMemo(
    () => templates.filter((template) => String(template.status || '').toLowerCase() === 'approved'),
    [templates],
  );
  const selectedTemplate = approvedTemplates.find((template) => template.name === selectedTemplateName);
  const requiredParams = bodyPlaceholderCount(selectedTemplate);

  const load = () => {
    if (!activeClient) return;
    setLoading(true);
    setLoadError('');
    Promise.all([
      api.get(`/contacts?clientId=${activeClient._id}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`),
      api.get(`/contacts/tags?clientId=${activeClient._id}`),
      api.get(`/templates?clientId=${activeClient._id}`),
    ]).then(([contactsRes, tagsRes, templatesRes]) => {
      setContacts(asArray(contactsRes.data).map(normalizeContact));
      setTags(asArray(tagsRes.data).filter(Boolean));
      setTemplates(asArray(templatesRes.data));
    })
      .catch((err) => {
        setLoadError(err?.response?.data?.message || 'Could not load contacts for the selected client.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeClient, tag]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateParams([]);
      return;
    }
    setTemplateParams((prev) => Array.from({ length: requiredParams }, (_, index) => prev[index] || ''));
  }, [requiredParams, selectedTemplateName]);

  const save = async () => {
    setFormError('');
    const phone = form.phone.trim();
    if (!phone) { setFormError('Phone number is required'); return; }
    if (!/^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s-]/g, ''))) {
      setFormError('Enter a valid phone number in E.164 format, e.g. +919876543210');
      return;
    }
    setSaving(true);
    try {
      const dto = { ...form, phone, clientId: activeClient._id, tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] };
      const { data } = await api.post('/contacts', dto);
      const saved = normalizeContact(data);
      setContacts((prev) => [saved, ...prev.filter((contact) => contact._id !== saved._id)]);
      setTags((prev) => Array.from(new Set([...prev, ...saved.tags])).filter(Boolean));
      setModal(false);
      setForm(blank);
      load();
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Could not save contact. The phone number may already exist.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete contact?')) return;
    try {
      await api.delete(`/contacts/${id}`);
      setContacts((prev) => prev.filter((contact) => contact._id !== id));
    } catch {
      alert('Could not delete contact. Please try again.');
    }
  };

  const openMessage = (contact) => {
    const firstTemplate = approvedTemplates[0];
    setMessageContact(contact);
    setMessageMode(firstTemplate ? 'template' : 'text');
    setSelectedTemplateName(firstTemplate?.name || '');
    setTemplateParams([]);
    setMessageText('');
    setMessageError('');
    setMessageModal(true);
  };

  const closeMessage = () => {
    if (sendingMessage) return;
    setMessageModal(false);
    setMessageContact(null);
    setMessageText('');
    setSelectedTemplateName('');
    setTemplateParams([]);
    setMessageError('');
  };

  const sendDirectMessage = async () => {
    if (!activeClient || !messageContact) return;
    const normalizedPhone = String(messageContact.phone || '').replace(/[^\d]/g, '');

    if (!/^[1-9]\d{7,14}$/.test(normalizedPhone)) {
      setMessageError('Use a WhatsApp phone number with country code, e.g. 918210490833 for India. Do not use a local-only number.');
      return;
    }

    if (messageMode === 'text' && !messageText.trim()) return;
    if (messageMode === 'template' && !selectedTemplate) return;
    if (messageMode === 'template' && templateParams.slice(0, requiredParams).some((value) => !value.trim())) {
      setMessageError(`Provide ${requiredParams} template parameter value(s).`);
      return;
    }

    setSendingMessage(true);
    setMessageError('');
    try {
      if (messageMode === 'template') {
        await api.post('/inbox/template', {
          clientId: activeClient._id,
          phone: normalizedPhone,
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language,
          bodyParameters: templateParams.slice(0, requiredParams),
        });
      } else {
        await api.post('/inbox/reply', {
          clientId: activeClient._id,
          phone: normalizedPhone,
          text: messageText.trim(),
        });
      }
      closeMessage();
    } catch (err) {
      setMessageError(
        err?.response?.data?.message ||
        'Could not send message. Check the phone number, template approval status, and Meta permissions.'
      );
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvError('');
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');

      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
      const phoneIdx = headers.indexOf('phone');
      if (phoneIdx === -1) throw new Error('CSV must include a "phone" column.');

      const parsed = lines.slice(1).map((line) => {
        const vals = parseCSVLine(line);
        const obj = {};
        headers.forEach((header, index) => { obj[header] = vals[index]; });
        return { phone: obj.phone, name: obj.name, tags: obj.tags ? obj.tags.split('|').map((t) => t.trim()).filter(Boolean) : [] };
      }).filter((contact) => contact.phone);

      if (parsed.length === 0) throw new Error('No valid rows with a phone number were found.');

      const { data } = await api.post('/contacts/bulk', { clientId: activeClient._id, contacts: parsed });
      load();
      if (data?.skipped) {
        setCsvError(`Imported ${parsed.length - data.skipped} contacts. Skipped ${data.skipped} row(s) with missing phone numbers.`);
      }
    } catch (err) {
      setCsvError(err?.response?.data?.message || err.message || 'Could not import CSV. Please check the file format.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const rows = asArray(contacts).map(normalizeContact);
  const query = search.trim().toLowerCase();
  const filtered = rows.filter((contact) => !query || contact.name.toLowerCase().includes(query) || contact.phone.includes(query));
  const canSend = messageMode === 'template'
    ? Boolean(selectedTemplate) && templateParams.slice(0, requiredParams).every((value) => value.trim())
    : Boolean(messageText.trim());

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={`${rows.length} contacts`}
        action={(
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} disabled={importing} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing || !activeClient}>
              <Upload size={15} />{importing ? 'Importing...' : 'Import CSV'}
            </Button>
            <Button onClick={() => { setForm(blank); setFormError(''); setModal(true); }} disabled={!activeClient}>
              <Plus size={15} />Add Contact
            </Button>
          </div>
        )}
      />

      {!activeClient && (
        <div className="soft-alert border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 mb-5">
          Select a client first to manage contacts.
        </div>
      )}
      {csvError && <div className="soft-alert border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 mb-5">{csvError}</div>}
      {loadError && <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 mb-5">{loadError}</div>}

      {activeClient && (
        <div className="mb-4 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Showing contacts for <span className="font-medium text-foreground">{activeClient.name || activeClient._id}</span>
          <span className="ml-2 font-mono">{activeClient._id}</span>
        </div>
      )}

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setTag('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!tag ? 'bg-brand text-white border-brand' : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>All</button>
          {tags.map((tagItem) => (
            <button key={tagItem} onClick={() => setTag(tagItem)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${tag === tagItem ? 'bg-brand text-white border-brand' : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>{tagItem}</button>
          ))}
        </div>
      </div>

      {loading && <div className="flex justify-center py-20"><Spinner size={32} /></div>}

      {!loading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--dark-border)]">
                  {['Name', 'Phone', 'Tags', 'Opted Out', ''].map((header) => (
                    <th key={header} className="text-left px-4 py-3 text-xs font-medium text-[var(--muted-text)]">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dark-border)]">
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-12 text-[var(--muted-text)]">No contacts found</td></tr>
                )}
                {filtered.map((contact) => (
                  <tr key={contact._id} className="table-row-hover">
                    <td className="px-4 py-3 font-medium">{contact.name || '-'}</td>
                    <td className="px-4 py-3 text-[var(--muted-text)]">{contact.phone}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {contact.tags?.map((tagItem) => <Badge key={tagItem} label={tagItem} color="blue" />)}
                      </div>
                    </td>
                    <td className="px-4 py-3">{contact.isOptedOut ? <Badge label="Opted out" color="red" /> : <Badge label="Active" color="green" />}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openMessage(contact)}
                          className="text-muted-foreground transition-colors hover:text-brand"
                          aria-label={`Send message to ${contact.name || contact.phone}`}
                        >
                          <Send size={14} />
                        </button>
                        <button onClick={() => remove(contact._id)} className="text-muted-foreground hover:text-red-500 transition-colors" aria-label={`Delete ${contact.name || contact.phone}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Add Contact"
        footer={(
          <>
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </>
        )}
      >
        <div className="space-y-3">
          {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{formError}</div>}
          <Input label="Phone (E.164) *" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="+919876543210" />
          <Input label="Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="John Doe" />
          <Input label="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))} placeholder="vip, newsletter" />
        </div>
      </Modal>

      <Modal
        open={messageModal}
        onClose={closeMessage}
        title={`Send Message${messageContact ? ` to ${messageContact.name || messageContact.phone}` : ''}`}
        footer={(
          <>
            <Button variant="outline" onClick={closeMessage} disabled={sendingMessage}>Cancel</Button>
            <Button onClick={sendDirectMessage} disabled={sendingMessage || !canSend}>{sendingMessage ? 'Sending...' : 'Send'}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          {messageContact && (
            <div className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Sending from <span className="font-medium text-foreground">{activeClient?.name || activeClient?._id}</span> to <span className="font-mono text-foreground">{messageContact.phone}</span>
            </div>
          )}

          {messageError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{messageError}</div>}

          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setMessageMode('template')}
              disabled={approvedTemplates.length === 0}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${messageMode === 'template' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground disabled:opacity-50'}`}
            >
              Template
            </button>
            <button
              type="button"
              onClick={() => setMessageMode('text')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${messageMode === 'text' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Text
            </button>
          </div>

          {messageMode === 'template' ? (
            <>
              <Select
                label="Template *"
                value={selectedTemplateName}
                onChange={(e) => setSelectedTemplateName(e.target.value)}
              >
                {approvedTemplates.length === 0 && <option value="">No approved templates</option>}
                {approvedTemplates.map((template) => (
                  <option key={template._id} value={template.name}>{template.name} ({template.language})</option>
                ))}
              </Select>
              {selectedTemplate && (
                <div className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  {bodyText(selectedTemplate) || 'No body text'}
                </div>
              )}
              {Array.from({ length: requiredParams }, (_, index) => (
                <Input
                  key={index}
                  label={`Body parameter {{${index + 1}}} *`}
                  value={templateParams[index] || ''}
                  onChange={(e) => setTemplateParams((prev) => {
                    const next = [...prev];
                    next[index] = e.target.value;
                    return next;
                  })}
                  placeholder={index === 0 ? (messageContact?.name || 'Customer name') : `Value ${index + 1}`}
                />
              ))}
              {approvedTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground">Create or sync an approved template before sending template messages.</p>
              )}
            </>
          ) : (
            <>
              <Textarea
                rows={5}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message..."
              />
              <p className="text-xs text-muted-foreground">
                Free-form text can fail outside the 24-hour customer service window. Use an approved template for cold outreach or re-engagement.
              </p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
