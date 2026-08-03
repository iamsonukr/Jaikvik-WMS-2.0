'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, Textarea, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';
import { CheckCircle2, Clock, Download, Pencil, Plus, Search, Send, Tag, Trash2, Upload, Users, X } from 'lucide-react';

const blank = { name: '', phone: '', tags: [] };
const blankTag = { name: '', color: '#3b82f6', description: '' };
const blankGroup = { name: '', description: '' };

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

function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
  const headers = parseCSVLine(lines[0]).map((header, index) => header.trim() || `Column ${index + 1}`);
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCSVLine(line);
    const obj = { __rowNumber: index + 2 };
    headers.forEach((header, headerIndex) => { obj[header] = values[headerIndex] || ''; });
    return obj;
  });
  return { headers, rows };
}

function guessColumn(headers, options) {
  const normalized = headers.map((header) => ({ raw: header, value: header.toLowerCase().replace(/[^a-z0-9]/g, '') }));
  return normalized.find((header) => options.includes(header.value))?.raw || '';
}

function splitTags(value) {
  return String(value || '')
    .split(/[|,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
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

function normalizeTag(tag) {
  if (typeof tag === 'string') return { _id: tag, name: tag, color: '#3b82f6', description: '' };
  return {
    ...tag,
    _id: tag?._id || tag?.id,
    name: String(tag?.name || '').trim(),
    color: tag?.color || '#3b82f6',
    description: tag?.description || '',
  };
}

function normalizeSegment(segment) {
  return {
    ...segment,
    _id: segment?._id || segment?.id,
    name: String(segment?.name || '').trim(),
    description: segment?.description || '',
    tags: Array.isArray(segment?.tags) ? segment.tags : [],
    matchMode: segment?.matchMode === 'all' ? 'all' : 'any',
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportContactsCsv(items, filename = 'contacts-export.csv') {
  const headers = ['phone', 'name', 'tags', 'status'];
  const lines = [
    headers.join(','),
    ...items.map((contact) => [
      contact.phone,
      contact.name,
      (contact.tags || []).join(';'),
      contact.isOptedOut ? 'opted_out' : 'active',
    ].map(csvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  const pathname = usePathname();
  const importHistoryHref = `${String(pathname || '/client/contacts').replace(/\/$/, '')}/import-history`;
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);
  const [segments, setSegments] = useState([]);
  const [tag, setTag] = useState('');
  const [segmentTags, setSegmentTags] = useState([]);
  const [segmentMatchMode, setSegmentMatchMode] = useState('any');
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [groupForm, setGroupForm] = useState(blankGroup);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [tagModal, setTagModal] = useState(false);
  const [tagForm, setTagForm] = useState(blankTag);
  const [tagSearch, setTagSearch] = useState('');
  const [tagColorFilter, setTagColorFilter] = useState('all');
  const [tagSort, setTagSort] = useState({ key: 'tag', direction: 'asc' });
  const [editingTagId, setEditingTagId] = useState(null);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [previewingImport, setPreviewingImport] = useState(false);
  const [committingImport, setCommittingImport] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importHeaders, setImportHeaders] = useState([]);
  const [importRows, setImportRows] = useState([]);
  const [importMapping, setImportMapping] = useState({ phone: '', name: '', tags: '' });
  const [importPreview, setImportPreview] = useState(null);
  const [importPreviewSearch, setImportPreviewSearch] = useState('');
  const [importPreviewStatusFilter, setImportPreviewStatusFilter] = useState('all');
  const [importPreviewSort, setImportPreviewSort] = useState({ key: 'row', direction: 'asc' });
  const [importResult, setImportResult] = useState(null);
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
  const [contactSort, setContactSort] = useState({ key: 'name', direction: 'asc' });
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileRef = useRef();
  const selectAllRef = useRef();

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
    return Promise.all([
      api.get(`/contacts?whatsappAccountId=${activeClient._id}`),
      api.get(`/contacts/tags?whatsappAccountId=${activeClient._id}`),
      api.get(`/contacts/segments?whatsappAccountId=${activeClient._id}`).catch(() => ({ data: [] })),
      api.get(`/templates?whatsappAccountId=${activeClient._id}`),
    ]).then(([contactsRes, tagsRes, segmentsRes, templatesRes]) => {
      setContacts(asArray(contactsRes.data).map(normalizeContact));
      setTags(asArray(tagsRes.data).map(normalizeTag).filter((tagItem) => tagItem.name));
      setSegments(asArray(segmentsRes.data).map(normalizeSegment).filter((segment) => segment.name));
      setTemplates(asArray(templatesRes.data));
    })
      .catch((err) => {
        setLoadError(err?.response?.data?.message || 'Could not load contacts for the selected client.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeClient]);

  useEffect(() => {
    setSelectedContactIds((current) => current.filter((id) => contacts.some((contact) => contact._id === id)));
  }, [contacts]);

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
      const dto = { ...form, phone, whatsappAccountId: activeClient._id, tags: form.tags };
      const { data } = await api.post('/contacts', dto);
      const saved = normalizeContact(data);
      setContacts((prev) => [saved, ...prev.filter((contact) => contact._id !== saved._id)]);
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
      setSelectedContactIds((prev) => prev.filter((contactId) => contactId !== id));
    } catch {
      alert('Could not delete contact. Please try again.');
    }
  };

  const deleteSelectedContacts = async () => {
    if (!selectedContactIds.length) return;
    if (!confirm(`Delete ${selectedContactIds.length} selected contact${selectedContactIds.length === 1 ? '' : 's'}?`)) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(selectedContactIds.map((id) => api.delete(`/contacts/${id}`)));
      const deletedIds = selectedContactIds.filter((_, index) => results[index].status === 'fulfilled');
      const failedCount = results.length - deletedIds.length;
      setContacts((prev) => prev.filter((contact) => !deletedIds.includes(contact._id)));
      setSelectedContactIds((prev) => prev.filter((id) => !deletedIds.includes(id)));
      if (failedCount) alert(`${failedCount} contact${failedCount === 1 ? '' : 's'} could not be deleted. Please try again.`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const clearSegment = () => {
    setTag('');
    setSegmentTags([]);
    setSelectedSegmentId('');
    setSegmentMatchMode('any');
    setGroupError('');
  };

  const toggleSegmentTag = (tagName) => {
    setTag('');
    setSelectedSegmentId('');
    setGroupError('');
    setSegmentTags((current) => (
      current.includes(tagName)
        ? current.filter((name) => name !== tagName)
        : [...current, tagName]
    ));
  };

  const applySegment = (segmentId) => {
    setSelectedSegmentId(segmentId);
    setTag('');
    setGroupError('');
    const segment = segments.find((item) => item._id === segmentId);
    if (!segment) {
      setSegmentTags([]);
      setSegmentMatchMode('any');
      return;
    }
    setSegmentTags(segment.tags || []);
    setSegmentMatchMode(segment.matchMode || 'any');
    setGroupForm((prev) => ({ ...prev, name: segment.name }));
  };

  const createGroup = async () => {
    if (!activeClient || !segmentTags.length) return;
    const name = groupForm.name.trim();
    if (!name) {
      setGroupError('Enter a group name before saving.');
      return;
    }
    setGroupSaving(true);
    setGroupError('');
    try {
      const { data } = await api.post('/contacts/segments', {
        whatsappAccountId: activeClient._id,
        name,
        description: groupForm.description,
        tags: segmentTags,
        matchMode: segmentMatchMode,
      });
      const saved = normalizeSegment(data);
      setSegments((current) => [saved, ...current.filter((item) => item._id !== saved._id)]);
      setSelectedSegmentId(saved._id);
      setGroupForm(blankGroup);
    } catch (err) {
      setGroupError(err?.response?.data?.message || 'Could not save group.');
    } finally {
      setGroupSaving(false);
    }
  };

  const deleteGroup = async (segmentId) => {
    if (!segmentId) return;
    if (!confirm('Delete this saved group?')) return;
    try {
      await api.delete(`/contacts/segments/${segmentId}`);
      setSegments((current) => current.filter((item) => item._id !== segmentId));
      if (selectedSegmentId === segmentId) clearSegment();
    } catch {
      setGroupError('Could not delete group.');
    }
  };

  const exportCurrentSegment = () => {
    if (!sortedContacts.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const segmentName = selectedSegmentId
      ? segments.find((item) => item._id === selectedSegmentId)?.name
      : segmentTags.length
        ? segmentTags.join('-')
        : tag || 'all-contacts';
    const safeName = String(segmentName || 'contacts').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    exportContactsCsv(sortedContacts, `${safeName || 'contacts'}-${stamp}.csv`);
  };

  const openTags = () => {
    setTagForm(blankTag);
    setEditingTagId(null);
    setTagError('');
    setTagModal(true);
  };

  const editTag = (tagItem) => {
    setTagForm({ name: tagItem.name, color: tagItem.color || '#3b82f6', description: tagItem.description || '' });
    setEditingTagId(tagItem._id);
    setTagError('');
  };

  const saveTag = async () => {
    if (!activeClient) return;
    setTagError('');
    if (!tagForm.name.trim()) { setTagError('Tag name is required'); return; }
    setTagSaving(true);
    try {
      if (editingTagId) await api.patch(`/contacts/tags/${editingTagId}`, tagForm);
      else await api.post('/contacts/tags', { ...tagForm, whatsappAccountId: activeClient._id });
      setTagForm(blankTag);
      setEditingTagId(null);
      load();
    } catch (err) {
      setTagError(err?.response?.data?.message || 'Could not save tag.');
    } finally {
      setTagSaving(false);
    }
  };

  const deleteTag = async (tagItem) => {
    if (!confirm(`Delete tag "${tagItem.name}"? It will be removed from matching contacts.`)) return;
    try {
      await api.delete(`/contacts/tags/${tagItem._id}`);
      if (tag === tagItem.name) setTag('');
      setForm((prev) => ({ ...prev, tags: prev.tags.filter((name) => name !== tagItem.name) }));
      load();
    } catch (err) {
      setTagError(err?.response?.data?.message || 'Could not delete tag.');
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
          whatsappAccountId: activeClient._id,
          phone: normalizedPhone,
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language,
          bodyParameters: templateParams.slice(0, requiredParams),
        });
      } else {
        await api.post('/inbox/reply', {
          whatsappAccountId: activeClient._id,
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
    setImportResult(null);
    setImportPreview(null);
    try {
      const text = await file.text();
      const parsed = parseCSVText(text);
      setImportFileName(file.name);
      setImportHeaders(parsed.headers);
      setImportRows(parsed.rows);
      setImportMapping({
        phone: guessColumn(parsed.headers, ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'whatsapp', 'whatsappnumber']),
        name: guessColumn(parsed.headers, ['name', 'fullname', 'customername', 'contactname']),
        tags: guessColumn(parsed.headers, ['tags', 'tag', 'segment', 'segments', 'labels']),
      });
      setImportOpen(true);
    } catch (err) {
      setCsvError(err?.response?.data?.message || err.message || 'Could not import CSV. Please check the file format.');
    } finally {
      e.target.value = '';
    }
  };

  const mappedContacts = useMemo(() => importRows.map((row) => ({
    rowNumber: row.__rowNumber,
    phone: importMapping.phone ? row[importMapping.phone] : '',
    name: importMapping.name ? row[importMapping.name] : '',
    tags: importMapping.tags ? splitTags(row[importMapping.tags]) : [],
  })), [importRows, importMapping]);

  const previewImport = async () => {
    if (!activeClient) return;
    setCsvError('');
    setImportResult(null);
    if (!importMapping.phone) { setCsvError('Map a phone number column before previewing.'); return; }
    setPreviewingImport(true);
    try {
      const { data } = await api.post('/contacts/import/preview', {
        whatsappAccountId: activeClient._id,
        contacts: mappedContacts,
        fileName: importFileName,
        mapping: importMapping,
      });
      setImportPreview(data);
    } catch (err) {
      setCsvError(err?.response?.data?.message || 'Could not preview import.');
    } finally {
      setPreviewingImport(false);
    }
  };

  const commitImport = async () => {
    if (!activeClient || !importPreview) return;
    setCsvError('');
    setCommittingImport(true);
    setImporting(true);
    try {
      const { data } = await api.post('/contacts/import/commit', {
        whatsappAccountId: activeClient._id,
        contacts: mappedContacts,
        fileName: importFileName,
        mapping: importMapping,
        updateExisting: true,
      });
      setImportResult(data);
      const returnedTags = [
        ...(data.createdTags || []),
        ...(data.reactivatedTags || []),
      ].map((name) => normalizeTag(name)).filter((tagItem) => tagItem.name);
      if (returnedTags.length) {
        setTags((current) => {
          const byName = new Map(current.map((tagItem) => [tagItem.name.toLowerCase(), tagItem]));
          returnedTags.forEach((tagItem) => {
            if (!byName.has(tagItem.name.toLowerCase())) byName.set(tagItem.name.toLowerCase(), tagItem);
          });
          return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      await load();
    } catch (err) {
      setCsvError(err?.response?.data?.message || 'Could not import contacts.');
    } finally {
      setCommittingImport(false);
      setImporting(false);
    }
  };

  const closeImport = () => {
    if (previewingImport || committingImport) return;
    setImportOpen(false);
    setImportFileName('');
    setImportHeaders([]);
    setImportRows([]);
    setImportMapping({ phone: '', name: '', tags: '' });
    setImportPreview(null);
    setImportResult(null);
  };

  const rows = asArray(contacts).map(normalizeContact);
  const query = search.trim().toLowerCase();
  const activeFilterTags = segmentTags.length ? segmentTags : (tag ? [tag] : []);
  const filtered = rows.filter((contact) => {
    const matchesSearch = !query
      || contact.name.toLowerCase().includes(query)
      || contact.phone.includes(query)
      || contact.tags?.some((tagItem) => tagItem.toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && !contact.isOptedOut)
      || (statusFilter === 'opted_out' && contact.isOptedOut);
    const contactTags = contact.tags || [];
    const matchesTags = activeFilterTags.length === 0
      || (segmentMatchMode === 'all'
        ? activeFilterTags.every((tagName) => contactTags.includes(tagName))
        : activeFilterTags.some((tagName) => contactTags.includes(tagName)));
    return matchesSearch && matchesStatus && matchesTags;
  });
  const sortedContacts = sortItems(filtered, contactSort, {
    name: (contact) => contact.name,
    phone: (contact) => contact.phone,
    tags: (contact) => (contact.tags || []).join(' '),
    status: (contact) => Boolean(contact.isOptedOut),
  });
  const contactsPage = usePagination(sortedContacts, {
    initialPageSize: 25,
    resetKey: `${search}|${tag}|${segmentTags.join('|')}|${segmentMatchMode}|${statusFilter}|${contactSort.key}|${contactSort.direction}`,
  });
  const selectedContactSet = useMemo(() => new Set(selectedContactIds), [selectedContactIds]);
  const currentPageContactIds = contactsPage.pageItems.map((contact) => contact._id).filter(Boolean);
  const allPageContactsSelected = currentPageContactIds.length > 0 && currentPageContactIds.every((id) => selectedContactSet.has(id));
  const somePageContactsSelected = currentPageContactIds.some((id) => selectedContactSet.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageContactsSelected && !allPageContactsSelected;
    }
  }, [allPageContactsSelected, somePageContactsSelected]);

  const toggleContactSelection = (contactId) => {
    setSelectedContactIds((current) => (
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId]
    ));
  };

  const toggleCurrentPageSelection = () => {
    setSelectedContactIds((current) => {
      const next = new Set(current);
      if (allPageContactsSelected) currentPageContactIds.forEach((id) => next.delete(id));
      else currentPageContactIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };
  const tagColorOptions = Array.from(new Set(tags.map((tagItem) => tagItem.color).filter(Boolean))).sort();
  const tagQuery = tagSearch.trim().toLowerCase();
  const filteredTags = tags.filter((tagItem) => {
    const matchesSearch = !tagQuery
      || String(tagItem.name || '').toLowerCase().includes(tagQuery)
      || String(tagItem.description || '').toLowerCase().includes(tagQuery)
      || String(tagItem.color || '').toLowerCase().includes(tagQuery);
    const matchesColor = tagColorFilter === 'all' || tagItem.color === tagColorFilter;
    return matchesSearch && matchesColor;
  });
  const sortedTags = sortItems(filteredTags, tagSort, {
    tag: (tagItem) => tagItem.name,
    description: (tagItem) => tagItem.description,
    color: (tagItem) => tagItem.color,
  });
  const tagsPage = usePagination(sortedTags, {
    initialPageSize: 10,
    resetKey: `${tagSearch}|${tagColorFilter}|${tagSort.key}|${tagSort.direction}`,
  });
  const previewRows = importPreview?.rows || [];
  const previewQuery = importPreviewSearch.trim().toLowerCase();
  const filteredPreviewRows = previewRows.filter((row) => {
    const statusLabel = row.status === 'new' ? 'new' : row.status === 'existing' ? 'update' : row.status === 'invalid' ? 'invalid' : 'duplicate';
    const matchesSearch = !previewQuery
      || String(row.rowNumber || '').includes(previewQuery)
      || String(row.phone || row.originalPhone || '').toLowerCase().includes(previewQuery)
      || String(row.name || '').toLowerCase().includes(previewQuery)
      || statusLabel.includes(previewQuery);
    const matchesStatus = importPreviewStatusFilter === 'all' || row.status === importPreviewStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const sortedPreviewRows = sortItems(filteredPreviewRows, importPreviewSort, {
    row: (row) => row.rowNumber || 0,
    phone: (row) => row.phone || row.originalPhone,
    name: (row) => row.name,
    status: (row) => row.status,
  });
  const previewRowsPage = usePagination(sortedPreviewRows, {
    initialPageSize: 50,
    resetKey: `${importPreviewSearch}|${importPreviewStatusFilter}|${importPreviewSort.key}|${importPreviewSort.direction}`,
  });
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
            {activeClient ? (
              <Link href={importHistoryHref}>
                <Button variant="outline"><Clock size={15} />Import History</Button>
              </Link>
            ) : (
              <Button variant="outline" disabled><Clock size={15} />Import History</Button>
            )}
            <Button variant="outline" onClick={openTags} disabled={!activeClient}>
              <Tag size={15} />Manage Tags
            </Button>
            <Button variant="outline" onClick={() => setGroupPanelOpen((open) => !open)} disabled={!activeClient}>
              <Users size={15} />Create Group
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

      {activeClient && groupPanelOpen && (
        <Card className="mb-5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-2">
                <Users size={15} className="text-primary" />
                <h2 className="text-sm font-semibold">Contact Groups</h2>
                <Badge label={`${filtered.length} shown`} color="blue" />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_140px_140px]">
                <Select value={selectedSegmentId} onChange={(e) => applySegment(e.target.value)}>
                  <option value="">Saved groups</option>
                  {segments.map((segment) => (
                    <option key={segment._id} value={segment._id}>
                      {segment.name} ({segment.tags.length})
                    </option>
                  ))}
                </Select>
                <Select value={segmentMatchMode} onChange={(e) => { setSelectedSegmentId(''); setSegmentMatchMode(e.target.value); }}>
                  <option value="any">Any tag</option>
                  <option value="all">All tags</option>
                </Select>
                <Button variant="outline" onClick={exportCurrentSegment} disabled={!sortedContacts.length}>
                  <Download size={14} />Export CSV
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tagItem) => {
                  const selected = segmentTags.includes(tagItem.name);
                  return (
                    <button
                      key={tagItem._id}
                      type="button"
                      onClick={() => toggleSegmentTag(tagItem.name)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tagItem.color }} />
                      {tagItem.name}
                    </button>
                  );
                })}
                {!tags.length && <span className="text-xs text-muted-foreground">Create tags first to build groups.</span>}
              </div>
            </div>

            <div className="w-full space-y-2 lg:w-80">
              <Input
                value={groupForm.name}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Group name"
              />
              <Input
                value={groupForm.description}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description"
              />
              {groupError && <p className="text-xs text-red-600 dark:text-red-400">{groupError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={createGroup} disabled={groupSaving || !segmentTags.length}>
                  <Plus size={14} />{groupSaving ? 'Saving...' : 'Save Group'}
                </Button>
                <Button variant="outline" onClick={clearSegment} disabled={!segmentTags.length && !tag && !selectedSegmentId}>
                  <X size={14} />Clear
                </Button>
                {selectedSegmentId && (
                  <Button variant="danger" onClick={() => deleteGroup(selectedSegmentId)}>
                    <Trash2 size={14} />Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, tag..."
            className="pl-8"
          />
        </div>
        <Select value={tag} onChange={(e) => { setSegmentTags([]); setSelectedSegmentId(''); setTag(e.target.value); }}>
          <option value="">All tags</option>
          {tags.map((tagItem) => <option key={tagItem._id} value={tagItem.name}>{tagItem.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="opted_out">Opted out</option>
        </Select>
      </div>

      {loading && <div className="flex justify-center py-20"><Spinner size={32} /></div>}

      {!loading && (
        <Card className="p-0 overflow-hidden">
          {selectedContactIds.length > 0 && (
            <div className="flex flex-col gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{selectedContactIds.length} contact{selectedContactIds.length === 1 ? '' : 's'} selected</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedContactIds([])} disabled={bulkDeleting}>
                  <X size={13} />Clear Selection
                </Button>
                <Button variant="danger" size="sm" onClick={deleteSelectedContacts} disabled={bulkDeleting}>
                  <Trash2 size={13} />{bulkDeleting ? 'Deleting...' : 'Delete Selected'}
                </Button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allPageContactsSelected}
                      onChange={toggleCurrentPageSelection}
                      disabled={currentPageContactIds.length === 0}
                      aria-label="Select all contacts on this page"
                      className="h-4 w-4 rounded border-input accent-brand"
                    />
                  </th>
                  <SortableTh label="Name" sortKey="name" sort={contactSort} onSort={setContactSort} />
                  <SortableTh label="Phone" sortKey="phone" sort={contactSort} onSort={setContactSort} />
                  <SortableTh label="Tags" sortKey="tags" sort={contactSort} onSort={setContactSort} />
                  <SortableTh label="Status" sortKey="status" sort={contactSort} onSort={setContactSort} />
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-[var(--muted-text)]">No contacts found</td></tr>
                )}
                {contactsPage.pageItems.map((contact) => (
                  <tr key={contact._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedContactSet.has(contact._id)}
                        onChange={() => toggleContactSelection(contact._id)}
                        aria-label={`Select ${contact.name || contact.phone}`}
                        className="h-4 w-4 rounded border-input accent-brand"
                      />
                    </td>
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
          <PaginationControls {...contactsPage} onPageChange={contactsPage.setPage} onPageSizeChange={contactsPage.setPageSize} />
        </Card>
      )}

      <Modal
        open={importOpen}
        onClose={closeImport}
        title="Import Contacts"
        footer={(
          <>
            <Button variant="outline" onClick={closeImport} disabled={previewingImport || committingImport}>Close</Button>
            <Button variant="outline" onClick={previewImport} disabled={previewingImport || committingImport || !importRows.length}>
              {previewingImport ? 'Previewing...' : 'Preview import'}
            </Button>
            <Button onClick={commitImport} disabled={committingImport || !importPreview || importPreview.importableRows === 0}>
              {committingImport ? 'Importing...' : 'Import approved rows'}
            </Button>
          </>
        )}
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">{importFileName || 'CSV file'}</p>
            <p className="text-xs text-muted-foreground">{importRows.length} data rows found</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Column Mapping</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Phone column *"
                value={importMapping.phone}
                onChange={(e) => { setImportMapping((prev) => ({ ...prev, phone: e.target.value })); setImportPreview(null); }}
              >
                <option value="">Choose column...</option>
                {importHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
              </Select>
              <Select
                label="Name column"
                value={importMapping.name}
                onChange={(e) => { setImportMapping((prev) => ({ ...prev, name: e.target.value })); setImportPreview(null); }}
              >
                <option value="">Do not import</option>
                {importHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
              </Select>
              <Select
                label="Tags column"
                value={importMapping.tags}
                onChange={(e) => { setImportMapping((prev) => ({ ...prev, tags: e.target.value })); setImportPreview(null); }}
              >
                <option value="">Do not import</option>
                {importHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
              </Select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Tags can be separated with comma, semicolon, or pipe. Missing tags are created automatically during import.</p>
          </div>

          {importPreview && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Ready</p>
                  <p className="mt-1 text-xl font-semibold">{importPreview.importableRows || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">New</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">{importPreview.newRows || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Existing updates</p>
                  <p className="mt-1 text-xl font-semibold">{importPreview.existingRows || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Invalid / duplicate</p>
                  <p className="mt-1 text-xl font-semibold text-red-600 dark:text-red-400">{(importPreview.invalidRows || 0) + (importPreview.fileDuplicateRows || 0)}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <Input placeholder="Search preview rows..." value={importPreviewSearch} onChange={(e) => setImportPreviewSearch(e.target.value)} />
                <Select value={importPreviewStatusFilter} onChange={(e) => setImportPreviewStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="existing">Update</option>
                  <option value="invalid">Invalid</option>
                  <option value="duplicate">Duplicate</option>
                </Select>
              </div>

              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <SortableTh label="Row" sortKey="row" sort={importPreviewSort} onSort={setImportPreviewSort} className="px-3 py-2" />
                      <SortableTh label="Phone" sortKey="phone" sort={importPreviewSort} onSort={setImportPreviewSort} className="px-3 py-2" />
                      <SortableTh label="Name" sortKey="name" sort={importPreviewSort} onSort={setImportPreviewSort} className="px-3 py-2" />
                      <th className="px-3 py-2 font-semibold">Tags</th>
                      <SortableTh label="Status" sortKey="status" sort={importPreviewSort} onSort={setImportPreviewSort} className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!sortedPreviewRows.length && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No preview rows match these filters.</td></tr>
                    )}
                    {previewRowsPage.pageItems.map((row) => (
                      <tr key={`${row.rowNumber}-${row.phone || row.originalPhone}`}>
                        <td className="px-3 py-2">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.phone || row.originalPhone || '-'}</td>
                        <td className="px-3 py-2">{row.name || '-'}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(row.tags || []).length ? row.tags.map((tagItem) => <Badge key={tagItem} label={tagItem} color="blue" />) : <span className="text-xs text-muted-foreground">-</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            label={row.status === 'new' ? 'New' : row.status === 'existing' ? 'Update' : row.status === 'invalid' ? 'Invalid' : 'Duplicate'}
                            color={row.status === 'new' ? 'green' : row.status === 'existing' ? 'blue' : 'red'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls {...previewRowsPage} onPageChange={previewRowsPage.setPage} onPageSizeChange={previewRowsPage.setPageSize} />

              {(importPreview.invalidReport?.length > 0 || importPreview.duplicateReport?.length > 0) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3">
                    <p className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">Invalid Number Report</p>
                    {importPreview.invalidReport?.length ? (
                      <div className="max-h-32 space-y-1 overflow-auto text-xs">
                        {importPreview.invalidReport.map((item) => (
                          <p key={`${item.rowNumber}-${item.phone}`}>Row {item.rowNumber}: {item.phone || '-'} - {item.reason}</p>
                        ))}
                      </div>
                    ) : <p className="text-xs text-muted-foreground">No invalid numbers.</p>}
                  </div>
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                    <p className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">Duplicate Report</p>
                    {importPreview.duplicateReport?.length ? (
                      <div className="max-h-32 space-y-1 overflow-auto text-xs">
                        {importPreview.duplicateReport.map((item) => (
                          <p key={`${item.rowNumber}-${item.phone}`}>Row {item.rowNumber}: {item.phone || '-'} - {item.reason}</p>
                        ))}
                      </div>
                    ) : <p className="text-xs text-muted-foreground">No duplicates detected.</p>}
                  </div>
                </div>
              )}
            </>
          )}

          {importResult && (
            <div className="rounded-lg border border-green-500/25 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 size={15} /> Import completed
              </div>
              <p className="mt-1">
                Created {importResult.createdCount || 0}, updated {importResult.updatedCount || 0}, skipped {importResult.skippedCount || 0}.
              </p>
              {(importResult.createdTags?.length > 0 || importResult.reactivatedTags?.length > 0) && (
                <p className="mt-1">
                  Tags created: {(importResult.createdTags || []).join(', ') || 'none'}
                  {importResult.reactivatedTags?.length > 0 ? `; reactivated: ${importResult.reactivatedTags.join(', ')}` : ''}
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

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
          <div className="space-y-2">
            <Select label="Tags" value="" onChange={(e) => {
              const selected = e.target.value;
              if (!selected) return;
              setForm((prev) => ({ ...prev, tags: Array.from(new Set([...prev.tags, selected])) }));
            }}>
              <option value="">Add an existing tag...</option>
              {tags.filter((tagItem) => !form.tags.includes(tagItem.name)).map((tagItem) => (
                <option key={tagItem._id} value={tagItem.name}>{tagItem.name}</option>
              ))}
            </Select>
            <div className="flex min-h-8 flex-wrap gap-1.5">
              {form.tags.length === 0 && <span className="text-xs text-muted-foreground">No tags selected</span>}
              {form.tags.map((tagName) => (
                <span key={tagName} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                  {tagName}
                  <button type="button" onClick={() => setForm((prev) => ({ ...prev, tags: prev.tags.filter((name) => name !== tagName) }))} aria-label={`Remove ${tagName}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Create or edit tag options from Manage Tags.</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={tagModal}
        onClose={() => setTagModal(false)}
        title="Manage Tags"
        footer={(
          <>
            <Button variant="outline" onClick={() => setTagModal(false)}>Close</Button>
            <Button onClick={saveTag} disabled={tagSaving}>{tagSaving ? 'Saving...' : editingTagId ? 'Update tag' : 'Create tag'}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          {tagError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{tagError}</div>}
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Input label="Tag name" value={tagForm.name} onChange={(e) => setTagForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="VIP customers" />
            <Input label="Color" type="color" value={tagForm.color} onChange={(e) => setTagForm((prev) => ({ ...prev, color: e.target.value }))} />
          </div>
          <Input label="Description" value={tagForm.description} onChange={(e) => setTagForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Optional internal note" />
          {editingTagId && (
            <Button variant="outline" size="sm" onClick={() => { setEditingTagId(null); setTagForm(blankTag); }}>
              Cancel edit
            </Button>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Input placeholder="Search tags..." value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} />
            <Select value={tagColorFilter} onChange={(e) => setTagColorFilter(e.target.value)}>
              <option value="all">All colors</option>
              {tagColorOptions.map((color) => <option key={color} value={color}>{color}</option>)}
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortableTh label="Tag" sortKey="tag" sort={tagSort} onSort={setTagSort} className="px-3 py-2" />
                  <SortableTh label="Description" sortKey="description" sort={tagSort} onSort={setTagSort} className="px-3 py-2" />
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tags.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No tags created yet.</td></tr>
                )}
                {tags.length > 0 && sortedTags.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No tags match these filters.</td></tr>
                )}
                {tagsPage.pageItems.map((tagItem) => (
                  <tr key={tagItem._id}>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tagItem.color }} />
                        <span className="font-medium">{tagItem.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{tagItem.description || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => editTag(tagItem)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`Edit ${tagItem.name}`}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteTag(tagItem)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" aria-label={`Delete ${tagItem.name}`}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls {...tagsPage} onPageChange={tagsPage.setPage} onPageSizeChange={tagsPage.setPageSize} />
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
