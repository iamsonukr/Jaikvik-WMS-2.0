'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Badge as BadgeIcon, BookOpen, Eye, FileText, Globe2, MessageSquare, MousePointerClick, Plus, RefreshCw, Search, Type } from 'lucide-react';
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Textarea, SortableTh, PaginationControls, sortItems, usePagination } from '@/components/ui';
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

const languageOptions = [
  ['en_US', 'English (US)'],
  ['en_GB', 'English (UK)'],
  ['en', 'English'],
  ['hi', 'Hindi'],
  ['es', 'Spanish'],
  ['es_MX', 'Spanish (Mexico)'],
  ['es_ES', 'Spanish (Spain)'],
  ['pt_BR', 'Portuguese (Brazil)'],
  ['pt_PT', 'Portuguese (Portugal)'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['nl', 'Dutch'],
  ['ar', 'Arabic'],
  ['bn', 'Bengali'],
  ['gu', 'Gujarati'],
  ['kn', 'Kannada'],
  ['ml', 'Malayalam'],
  ['mr', 'Marathi'],
  ['pa', 'Punjabi'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['ur', 'Urdu'],
  ['id', 'Indonesian'],
  ['ms', 'Malay'],
  ['fil', 'Filipino'],
  ['th', 'Thai'],
  ['vi', 'Vietnamese'],
  ['zh_CN', 'Chinese (Simplified)'],
  ['zh_TW', 'Chinese (Traditional)'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['ru', 'Russian'],
  ['tr', 'Turkish'],
  ['pl', 'Polish'],
  ['ro', 'Romanian'],
  ['uk', 'Ukrainian'],
  ['fa', 'Persian'],
  ['he', 'Hebrew'],
  ['sw', 'Swahili'],
];

function bodyPlaceholderCount(body) {
  const matches = [...String(body || '').matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function splitCsv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function templateBody(template) {
  return template.components?.find((component) => component.type === 'BODY')?.text
    || template.body
    || template.description
    || 'Meta library template';
}

function templateRejectionReason(template) {
  return template?.rejectionReason
    || template?.rejected_reason
    || template?.rawMeta?.rejected_reason
    || template?.rawMeta?.response?.rejected_reason
    || template?.rawMeta?.quality_score?.reason
    || '';
}

function formComponents(form) {
  const components = [];
  if (form.headerText?.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: form.headerText.trim() });
  if (form.body?.trim()) components.push({ type: 'BODY', text: form.body.trim() });
  if (form.footerText?.trim()) components.push({ type: 'FOOTER', text: form.footerText.trim() });
  const quickReplies = splitCsv(form.quickReplies);
  if (quickReplies.length) {
    components.push({ type: 'BUTTONS', buttons: quickReplies.map((text) => ({ type: 'QUICK_REPLY', text })) });
  }
  return components;
}

function renderWithExamples(text, examples) {
  return String(text || '').replace(/\{\{(\d+)\}\}/g, (_match, index) => examples[Number(index) - 1] || `{{${index}}}`);
}

function TemplatePreview({ template, examples = [], compact = false }) {
  const components = template?.components || [];
  const header = components.find((component) => component.type === 'HEADER');
  const body = components.find((component) => component.type === 'BODY');
  const footer = components.find((component) => component.type === 'FOOTER');
  const buttons = components.find((component) => component.type === 'BUTTONS')?.buttons || [];
  const reason = templateRejectionReason(template);

  return (
    <div className={`rounded-lg border border-border bg-secondary/45 p-3 ${compact ? '' : 'space-y-3'}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{template?.name || 'template_preview'}</p>
          <p className="text-xs text-muted-foreground">{template?.category || 'CATEGORY'} - {template?.language || 'language'}</p>
        </div>
        {template?.status && <StatusBadge status={String(template.status).toLowerCase()} />}
      </div>
      <div className="max-w-sm rounded-lg rounded-tr-sm bg-card p-3 shadow-sm ring-1 ring-border">
        {header?.text && <p className="mb-2 text-sm font-semibold">{renderWithExamples(header.text, examples)}</p>}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{renderWithExamples(body?.text || templateBody(template), examples)}</p>
        {footer?.text && <p className="mt-3 text-xs text-muted-foreground">{renderWithExamples(footer.text, examples)}</p>}
        {buttons.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {buttons.map((button, index) => (
              <div key={`${button.text}-${index}`} className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-center text-xs font-medium text-primary">
                {button.text || button.type}
              </div>
            ))}
          </div>
        )}
      </div>
      {reason && (
        <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <span className="inline-flex items-center gap-1 font-semibold"><AlertTriangle size={13} /> Rejection reason</span>
          <p className="mt-1">{reason}</p>
        </div>
      )}
    </div>
  );
}

function TemplateFormSection({ icon: Icon, title, children }) {
  return (
    <section className="rounded-lg border border-border/80 bg-background/75 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon size={16} />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
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
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [libraryError, setLibraryError] = useState('');
  const [templateFilters, setTemplateFilters] = useState({ search: '', status: 'all', category: 'all', language: 'all' });
  const [templateSort, setTemplateSort] = useState({ key: 'template', direction: 'asc' });

  const placeholderCount = useMemo(() => bodyPlaceholderCount(form.body), [form.body]);
  const formExampleValues = useMemo(() => splitCsv(form.bodyExamples), [form.bodyExamples]);
  const formPreviewTemplate = useMemo(() => ({
    name: form.name || 'template_preview',
    category: form.category,
    language: form.language,
    status: 'DRAFT',
    components: formComponents(form),
  }), [form]);
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
  const sortedTemplates = useMemo(() => sortItems(filteredTemplates, templateSort, {
    template: (template) => template.name,
    category: (template) => template.category,
    language: (template) => template.language,
    status: (template) => template.status,
    components: (template) => template.components?.length || 0,
    body: templateBody,
  }), [filteredTemplates, templateSort]);
  const templatesPage = usePagination(sortedTemplates, {
    initialPageSize: 10,
    resetKey: `${templateFilters.search}|${templateFilters.status}|${templateFilters.category}|${templateFilters.language}|${templateSort.key}|${templateSort.direction}`,
  });

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
                  <SortableTh label="Template" sortKey="template" sort={templateSort} onSort={setTemplateSort} />
                  <SortableTh label="Category" sortKey="category" sort={templateSort} onSort={setTemplateSort} />
                  <SortableTh label="Language" sortKey="language" sort={templateSort} onSort={setTemplateSort} />
                  <SortableTh label="Status" sortKey="status" sort={templateSort} onSort={setTemplateSort} />
                  <SortableTh label="Components" sortKey="components" sort={templateSort} onSort={setTemplateSort} />
                  <SortableTh label="Body preview" sortKey="body" sort={templateSort} onSort={setTemplateSort} />
                  <th className="px-4 py-3 font-semibold">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredTemplates.length && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No templates match these filters.</td></tr>
                )}
                {templatesPage.pageItems.map((template) => {
                  const reason = templateRejectionReason(template);
                  return (
                    <tr key={template._id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <p className="font-medium">{template.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{template._id}</p>
                      </td>
                      <td className="px-4 py-3">{template.category || '-'}</td>
                      <td className="px-4 py-3">{template.language || '-'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={template.status?.toLowerCase()} />
                        {reason && <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">{reason}</p>}
                      </td>
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
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(template)}>
                          <Eye size={13} /> Preview
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationControls {...templatesPage} onPageChange={templatesPage.setPage} onPageSizeChange={templatesPage.setPageSize} />
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => !creating && setModalOpen(false)}
        title="New template"
        className="!max-w-5xl"
        bodyClassName="bg-muted/20"
        footer={(
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={createTemplate} disabled={creating || !form.name.trim() || !form.body.trim()}>
              {creating ? 'Submitting...' : 'Submit to Meta'}
            </Button>
          </>
        )}
      >
        <div className="space-y-5">
          {formError && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <TemplateFormSection icon={BadgeIcon} title="Template setup">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input label="Template name *" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="order_update" />
                  <Select label="Category *" value={form.category} onChange={(e) => set('category', e.target.value)}>
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </Select>
                  <div className="sm:col-span-2">
                    <Select label="Language code *" value={form.language} onChange={(e) => set('language', e.target.value)}>
                      {languageOptions.map(([code, label]) => (
                        <option key={code} value={code}>{label} - {code}</option>
                      ))}
                    </Select>
                  </div>
                </div>
              </TemplateFormSection>

              <TemplateFormSection icon={MessageSquare} title="Message content">
                <div className="space-y-3">
                  <Input label="Header text" value={form.headerText} onChange={(e) => set('headerText', e.target.value)} placeholder="New offer from Jaikvik" />
                  <Textarea label="Body *" value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Hi {{1}}, your order {{2}} is ready." rows={6} className="min-h-[150px]" />
                  <Input label="Footer text" value={form.footerText} onChange={(e) => set('footerText', e.target.value)} placeholder="Reply STOP to unsubscribe" />
                </div>
              </TemplateFormSection>

              {(placeholderCount > 0 || form.bodyExamples) && (
                <TemplateFormSection icon={Type} title="Example values">
                  <Input
                    label={`Body examples * (${placeholderCount || 1})`}
                    value={form.bodyExamples}
                    onChange={(e) => set('bodyExamples', e.target.value)}
                    placeholder="Ravi, #12345"
                  />
                </TemplateFormSection>
              )}

              <TemplateFormSection icon={MousePointerClick} title="Quick replies">
                <Input label="Button labels" value={form.quickReplies} onChange={(e) => set('quickReplies', e.target.value)} placeholder="Yes, No, Call me" />
              </TemplateFormSection>
            </div>

            <aside className="lg:sticky lg:top-0 lg:self-start">
              <div className="rounded-lg border border-border/80 bg-background p-4 shadow-card">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Live preview</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">WhatsApp template message</p>
                  </div>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-brand-dark">
                    <Globe2 size={17} />
                  </span>
                </div>
                <TemplatePreview template={formPreviewTemplate} examples={formExampleValues} />
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-muted-foreground">Variables</p>
                    <p className="mt-1 font-semibold">{placeholderCount}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-muted-foreground">Replies</p>
                    <p className="mt-1 font-semibold">{splitCsv(form.quickReplies).length}</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(previewTemplate)}
        onClose={() => setPreviewTemplate(null)}
        title={previewTemplate ? `Template preview: ${previewTemplate.name}` : 'Template preview'}
        footer={<Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button>}
      >
        {previewTemplate && (
          <div className="space-y-4">
            <TemplatePreview template={previewTemplate} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="mt-1 text-sm font-semibold">{previewTemplate.category || '-'}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Language</p>
                <p className="mt-1 text-sm font-semibold">{previewTemplate.language || '-'}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-1"><StatusBadge status={previewTemplate.status?.toLowerCase()} /></div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Components</p>
              <div className="flex flex-wrap gap-1.5">
                {previewTemplate.components?.length
                  ? previewTemplate.components.map((component) => <Badge key={component.type} label={component.type} color="gray" />)
                  : <span className="text-sm text-muted-foreground">No components returned by Meta yet.</span>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
