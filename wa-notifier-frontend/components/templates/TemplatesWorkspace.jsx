'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Badge as BadgeIcon, BookOpen, FileText, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { useBasePath } from '@/hooks/useBasePath';
import { useClient } from '@/hooks/useClient';
import api from '@/lib/api';

const blankForm = {
  name: '',
  category: 'MARKETING',
  language: 'en_US',
  headerText: '',
  body: '',
  footerText: '',
  quickReplies: '',
  bodyExamples: '',
};

function bodyPlaceholderCount(body) {
  const matches = [...String(body || '').matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function templateBody(template) {
  return template.components?.find((component) => component.type === 'BODY')?.text
    || template.body
    || template.description
    || 'Meta library template';
}

export default function TemplatesWorkspace({ mode = 'list' }) {
  const router = useRouter();
  const basePath = useBasePath();
  const { activeClient } = useClient();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryCreating, setLibraryCreating] = useState(false);
  const [libraryTemplates, setLibraryTemplates] = useState([]);
  const [libraryPaging, setLibraryPaging] = useState(null);
  const [libraryFilters, setLibraryFilters] = useState({ search: '', language: 'en_US', category: '' });
  const [selectedLibraryTemplate, setSelectedLibraryTemplate] = useState(null);
  const [libraryTemplateName, setLibraryTemplateName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [libraryError, setLibraryError] = useState('');
  const [templateFilters, setTemplateFilters] = useState({ search: '', status: 'all', category: 'all', language: 'all' });

  const placeholderCount = useMemo(() => bodyPlaceholderCount(form.body), [form.body]);
  const templateFilterOptions = useMemo(() => ({
    statuses: Array.from(new Set(templates.map((template) => template.status).filter(Boolean))).sort(),
    categories: Array.from(new Set(templates.map((template) => template.category).filter(Boolean))).sort(),
    languages: Array.from(new Set(templates.map((template) => template.language).filter(Boolean))).sort(),
  }), [templates]);
  const filteredTemplates = useMemo(() => {
    const query = templateFilters.search.trim().toLowerCase();
    return templates.filter((template) => {
      const body = templateBody(template);
      const matchesSearch = !query
        || String(template.name || '').toLowerCase().includes(query)
        || String(template.category || '').toLowerCase().includes(query)
        || String(template.language || '').toLowerCase().includes(query)
        || String(template.status || '').toLowerCase().includes(query)
        || String(body || '').toLowerCase().includes(query);
      const matchesStatus = templateFilters.status === 'all' || template.status === templateFilters.status;
      const matchesCategory = templateFilters.category === 'all' || template.category === templateFilters.category;
      const matchesLanguage = templateFilters.language === 'all' || template.language === templateFilters.language;
      return matchesSearch && matchesStatus && matchesCategory && matchesLanguage;
    });
  }, [templates, templateFilters]);

  const loadTemplates = () => {
    if (!activeClient) {
      setTemplates([]);
      return;
    }

    setLoading(true);
    api.get(`/templates?whatsappAccountId=${activeClient._id}`)
      .then((r) => setTemplates(r.data))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  const fetchLibrary = async (cursorParams = {}) => {
    if (!activeClient) return;

    setLibraryLoading(true);
    setLibraryError('');
    try {
      const { data } = await api.get(`/templates/library/${activeClient._id}`, {
        params: {
          name_or_content: libraryFilters.search || undefined,
          language: libraryFilters.language || undefined,
          category: libraryFilters.category || undefined,
          limit: libraryFilters.category ? 100 : 25,
          ...cursorParams,
        },
      });
      setLibraryTemplates(data?.data || []);
      setLibraryPaging(data?.paging || null);
    } catch (err) {
      setLibraryError(err?.response?.data?.message || 'Could not fetch Meta template library.');
      setLibraryTemplates([]);
      setLibraryPaging(null);
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'list') loadTemplates();
  }, [activeClient, mode]);

  useEffect(() => {
    if (mode === 'library') fetchLibrary();
  }, [activeClient, mode]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setForm(blankForm);
    setFormError('');
    setModalOpen(true);
  };

  const sync = async () => {
    if (!activeClient) return;
    setSyncing(true);
    setPageError('');
    try {
      const { data } = await api.post(`/templates/sync/${activeClient._id}`);
      setTemplates(data);
    } catch (err) {
      setPageError(
        err?.response?.data?.message ||
        'Could not sync templates from Meta. Check that the account access token and WABA ID are correct.'
      );
    } finally {
      setSyncing(false);
    }
  };

  const createTemplate = async () => {
    if (!activeClient) return;

    const quickReplies = form.quickReplies.split(',').map((value) => value.trim()).filter(Boolean);
    const bodyExamples = form.bodyExamples.split(',').map((value) => value.trim()).filter(Boolean);

    setCreating(true);
    setFormError('');
    try {
      const { data } = await api.post('/templates', {
        whatsappAccountId: activeClient._id,
        name: form.name,
        category: form.category,
        language: form.language,
        headerText: form.headerText || undefined,
        body: form.body,
        footerText: form.footerText || undefined,
        quickReplies,
        bodyExamples,
      });
      setTemplates((prev) => [data, ...prev.filter((item) => item._id !== data._id)]);
      setModalOpen(false);
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Could not submit this template to Meta.');
    } finally {
      setCreating(false);
    }
  };

  const selectLibraryTemplate = (template) => {
    setSelectedLibraryTemplate(template);
    setLibraryTemplateName(template?.name ? `${template.name}_copy` : '');
    setLibraryError('');
  };

  const createFromLibrary = async () => {
    if (!activeClient || !selectedLibraryTemplate) return;

    const libraryTemplateId = selectedLibraryTemplate.library_template_name || selectedLibraryTemplate.name;
    if (!libraryTemplateId) {
      setLibraryError('This Meta library item does not include a template library name.');
      return;
    }

    setLibraryCreating(true);
    setLibraryError('');
    try {
      await api.post('/templates', {
        whatsappAccountId: activeClient._id,
        name: libraryTemplateName || `${libraryTemplateId}_copy`,
        category: selectedLibraryTemplate.category || libraryFilters.category || 'UTILITY',
        language: selectedLibraryTemplate.language || libraryFilters.language || 'en_US',
        libraryTemplateName: libraryTemplateId,
        libraryTemplateButtonInputs: selectedLibraryTemplate.library_template_button_inputs || undefined,
        libraryTemplateBodyInputs: selectedLibraryTemplate.library_template_body_inputs || undefined,
      });
      router.push(`${basePath}/templates`);
    } catch (err) {
      setLibraryError(err?.response?.data?.message || 'Could not create this template from Meta library.');
    } finally {
      setLibraryCreating(false);
    }
  };

  if (mode === 'library') {
    return (
      <>
        <PageHeader
          title="Meta template library"
          subtitle="Browse Meta's template catalog and add a selected template to this WhatsApp account"
          action={(
            <Link href={`${basePath}/templates`}>
              <Button variant="outline">
                <ArrowLeft size={15} />
                Templates
              </Button>
            </Link>
          )}
        />

        {!activeClient && (
          <div className="soft-alert border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 mb-5">
            Connect or select a WhatsApp account first.
          </div>
        )}

        <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_160px_140px_auto] lg:items-end">
          <Input
            label="Search Meta library"
            value={libraryFilters.search}
            onChange={(e) => setLibraryFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="payment, delivery, order"
          />
          <Input
            label="Language"
            value={libraryFilters.language}
            onChange={(e) => setLibraryFilters((prev) => ({ ...prev, language: e.target.value }))}
            placeholder="en_US"
          />
          <Select
            label="Category"
            value={libraryFilters.category}
            onChange={(e) => setLibraryFilters((prev) => ({ ...prev, category: e.target.value }))}
          >
            <option value="">All</option>
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
            <option value="AUTHENTICATION">Authentication</option>
          </Select>
          <Button onClick={() => fetchLibrary()} disabled={libraryLoading || !activeClient} variant="outline">
            <Search size={15} />
            Search
          </Button>
        </div>

        {libraryError && (
          <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 mb-5">{libraryError}</div>
        )}

        {selectedLibraryTemplate && (
          <Card className="mb-5 p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px_auto] lg:items-end">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Selected: {selectedLibraryTemplate.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{templateBody(selectedLibraryTemplate)}</p>
              </div>
              <Input
                label="Template name in your account"
                value={libraryTemplateName}
                onChange={(e) => setLibraryTemplateName(e.target.value)}
                placeholder="order_update_library"
              />
              <Button onClick={createFromLibrary} disabled={libraryCreating}>
                <BadgeIcon size={15} />
                {libraryCreating ? 'Creating...' : 'Use template'}
              </Button>
            </div>
          </Card>
        )}

        {libraryLoading ? (
          <div className="flex justify-center py-20"><Spinner size={32} /></div>
        ) : libraryTemplates.length === 0 ? (
          <Empty icon={BookOpen} title="No library templates" description="Search Meta's library by language, category, or content." />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {libraryTemplates.map((template) => {
              const active = selectedLibraryTemplate?.name === template.name;
              return (
                <button
                  key={`${template.name}-${template.language}`}
                  type="button"
                  onClick={() => selectLibraryTemplate(template)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    active ? 'border-brand bg-brand/10' : 'border-border bg-card hover:bg-accent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{template.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {(template.category || 'UTILITY')} - {(template.language || libraryFilters.language || 'en_US')}
                      </p>
                    </div>
                    {active && <Badge label="Selected" color="green" />}
                  </div>
                  <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                    {templateBody(template)}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {libraryPaging?.cursors && (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={!libraryPaging.cursors.before || libraryLoading} onClick={() => fetchLibrary({ before: libraryPaging.cursors.before })}>Previous</Button>
            <Button variant="outline" size="sm" disabled={!libraryPaging.cursors.after || libraryLoading} onClick={() => fetchLibrary({ after: libraryPaging.cursors.after })}>Next</Button>
          </div>
        )}
      </>
    );
  }

  const actions = (
    <>
      {activeClient ? (
        <Link href={`${basePath}/templates/library`}>
          <Button variant="outline">
            <BookOpen size={15} />
            Meta library
          </Button>
        </Link>
      ) : (
        <Button disabled variant="outline">
          <BookOpen size={15} />
          Meta library
        </Button>
      )}
      <Button onClick={openCreate} disabled={!activeClient}>
        <Plus size={15} />
        New template
      </Button>
      <Button onClick={sync} disabled={syncing || !activeClient} variant="outline">
        <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Syncing...' : 'Sync from Meta'}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader title="Templates" subtitle="Create, submit, and sync WhatsApp message templates" action={actions} />

      {!activeClient && (
        <div className="soft-alert border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300 mb-5">
          Connect or select a WhatsApp account first.
        </div>
      )}

      {pageError && (
        <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 mb-5">{pageError}</div>
      )}

      {loading && <div className="flex justify-center py-20"><Spinner size={32} /></div>}

      {!loading && templates.length === 0 && (
        <Empty
          icon={FileText}
          title="No templates"
          description="Create a template or sync existing templates from Meta."
          action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>}
        />
      )}

      {!loading && templates.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[1fr_170px_170px_170px]">
            <Input placeholder="Search template name, body, status..." value={templateFilters.search}
              onChange={(e) => setTemplateFilters((prev) => ({ ...prev, search: e.target.value }))} />
            <Select value={templateFilters.status} onChange={(e) => setTemplateFilters((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="all">All statuses</option>
              {templateFilterOptions.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
            <Select value={templateFilters.category} onChange={(e) => setTemplateFilters((prev) => ({ ...prev, category: e.target.value }))}>
              <option value="all">All categories</option>
              {templateFilterOptions.categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </Select>
            <Select value={templateFilters.language} onChange={(e) => setTemplateFilters((prev) => ({ ...prev, language: e.target.value }))}>
              <option value="all">All languages</option>
              {templateFilterOptions.languages.map((language) => <option key={language} value={language}>{language}</option>)}
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {['Template', 'Category', 'Language', 'Status', 'Components', 'Body preview'].map((header) => (
                    <th key={header} className="px-4 py-3 font-semibold">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredTemplates.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No templates match these filters.</td></tr>
                )}
                {filteredTemplates.map((template) => (
                  <tr key={template._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">{template.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{template._id}</p>
                    </td>
                    <td className="px-4 py-3">{template.category || '-'}</td>
                    <td className="px-4 py-3">{template.language || '-'}</td>
                    <td className="px-4 py-3"><StatusBadge status={template.status?.toLowerCase()} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {template.components?.length
                          ? template.components.map((component) => <Badge key={component.type} label={component.type} color="gray" />)
                          : <span className="text-muted-foreground">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-md truncate text-muted-foreground">{templateBody(template) || 'No body text'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => !creating && setModalOpen(false)}
        title="New template"
        footer={(
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={createTemplate} disabled={creating || !form.name.trim() || !form.body.trim()}>
              {creating ? 'Submitting...' : 'Submit to Meta'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Template name *" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="order_update" />
            <Select label="Category *" value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
            </Select>
          </div>

          <Input label="Language code *" value={form.language} onChange={(e) => set('language', e.target.value)} placeholder="en_US" />
          <Input label="Header text" value={form.headerText} onChange={(e) => set('headerText', e.target.value)} placeholder="New offer from Jaikvik" />
          <Textarea label="Body *" value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Hi {{1}}, your order {{2}} is ready." rows={5} />

          {placeholderCount > 0 && (
            <Input
              label={`Body examples * (${placeholderCount})`}
              value={form.bodyExamples}
              onChange={(e) => set('bodyExamples', e.target.value)}
              placeholder="Ravi, #12345"
            />
          )}

          <Input label="Footer text" value={form.footerText} onChange={(e) => set('footerText', e.target.value)} placeholder="Reply STOP to unsubscribe" />
          <Input label="Quick replies" value={form.quickReplies} onChange={(e) => set('quickReplies', e.target.value)} placeholder="Yes, No, Call me" />
        </div>
      </Modal>
    </>
  );
}
