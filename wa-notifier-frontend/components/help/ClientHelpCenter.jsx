'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, BookOpen, Bot, Check, ChevronDown, CircleHelp, FileText, Inbox,
  LayoutDashboard, LifeBuoy, Link2, Megaphone, MessageCircle, Plug, Search,
  Settings, ShieldCheck, Users, UsersRound, Wallet, X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { normalizeRole } from '@/lib/roles';
import { helpArticles, helpCategories, searchHelp } from '@/lib/client-help.mjs';

const icons = { BookOpen, Bot, CircleHelp, FileText, Inbox, LayoutDashboard, LifeBuoy,
  Megaphone, MessageCircle, Plug, Settings, Users, UsersRound, Wallet };
const articleById = new Map(helpArticles.map(article => [article.id, article]));
const featured = [
  { id: 'first-day', title: 'Start here', description: 'Your first-day setup checklist', icon: BookOpen },
  { id: 'new-campaign', title: 'Send a campaign', description: 'Choose an audience and send', icon: Megaphone },
  { id: 'inbox-reply', title: 'Help a customer', description: 'Read and reply in your inbox', icon: Inbox },
  { id: 'sending-failed', title: 'Fix a problem', description: 'Check common sending issues', icon: LifeBuoy },
];
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const destinationLabels = {
  '/signup': 'sign-up', '/client/dashboard': 'Dashboard', '/client/alerts': 'Notifications',
  '/client/analytics': 'Analytics', '/client/connect-whatsapp': 'WhatsApp Setup',
  '/client/contacts': 'Contacts', '/client/contacts/import-history': 'Import History',
  '/client/templates': 'Templates', '/client/templates/library': 'Meta template library',
  '/client/broadcasts': 'Broadcasts', '/client/inbox': 'Inbox', '/client/chatbot': 'Chatbot',
  '/client/integrations': 'Integrations', '/client/integrations/google-sheets': 'Google Sheets',
  '/client/integrations/google-calendar': 'Google Calendar', '/client/integrations/calendly': 'Calendly',
  '/client/integrations/zapier': 'Zapier', '/client/plans': 'Plans', '/client/wallet': 'Wallet',
  '/client/payments': 'Payments', '/client/team': 'Team', '/client/settings': 'Settings', '/client/tickets': 'Support & Tickets',
};

export default function ClientHelpCenter() {
  const { user } = useAuth();
  const isOwner = normalizeRole(user?.role) === 'client_owner';
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [expanded, setExpanded] = useState(new Set());
  const [anchor, setAnchor] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const results = useMemo(() => searchHelp(query, categoryId), [query, categoryId]);
  const allSearchResults = useMemo(() => searchHelp(query), [query]);
  const grouped = helpCategories.map(category => ({ ...category, articles: results.filter(a => a.categoryId === category.id) }))
    .filter(category => category.articles.length);
  const selectedCategory = helpCategories.find(category => category.id === categoryId);
  const allExpanded = results.length > 0 && results.every(article => expanded.has(article.id));

  useEffect(() => {
    const readHash = () => {
      let id;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      const article = articleById.get(id);
      if (!article) return;
      setQuery(''); setCategoryId(article.categoryId);
      setExpanded(previous => new Set([...previous, id])); setAnchor(id);
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    window.addEventListener('popstate', readHash);
    return () => { window.removeEventListener('hashchange', readHash); window.removeEventListener('popstate', readHash); };
  }, []);
  useEffect(() => {
    if (!anchor) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
      document.getElementById(`question-${anchor}`)?.focus({ preventScroll: true });
      setAnchor('');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchor]);
  useEffect(() => {
    if (!copyNotice) return;
    const timer = setTimeout(() => setCopyNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [copyNotice]);

  const openArticle = id => {
    const article = articleById.get(id);
    if (!article) return;
    setCategoryId(article.categoryId); setQuery('');
    setExpanded(previous => new Set([...previous, id])); setAnchor(id);
    window.history.pushState(null, '', `#${id}`);
  };
  const toggle = id => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const chooseCategory = id => {
    setCategoryId(id);
    // A category is a new browsing context; remove a now-misleading article URL.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };
  const copyArticle = async id => {
    const url = new URL(window.location.href); url.hash = id;
    try { await navigator.clipboard.writeText(url.href); setCopyNotice('Guide link copied.'); }
    catch { window.history.replaceState(null, '', url.href); setCopyNotice('Copy the guide link from your browser address bar.'); }
  };

  return <div className="mx-auto max-w-7xl space-y-6">
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"><BookOpen size={14} />Your client workspace guide</div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">FAQ & Help Center</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">From connecting your first number to understanding a payment, find clear steps for every part of your workspace.</p>
        <form className="mt-6" role="search" onSubmit={e => { e.preventDefault(); document.getElementById('help-results')?.focus(); }}>
          <label htmlFor="help-search" className="sr-only">Search all help guides</label>
          <div className="relative flex items-center">
            <Search size={20} aria-hidden="true" className="pointer-events-none absolute left-4 text-muted-foreground" />
            <input id="help-search" type="search" autoComplete="off" value={query} onChange={e => { setQuery(e.target.value); chooseCategory('all'); }}
              placeholder="Search a question, feature or error…" className={`h-14 w-full rounded-xl border border-input bg-background pl-12 pr-12 text-base shadow-sm placeholder:text-muted-foreground ${focus}`} />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className={`absolute right-3 rounded-lg p-2 text-muted-foreground hover:bg-accent ${focus}`}><X size={18} /></button>}
          </div>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Popular searches:</span>{['CSV import', 'verification code', 'wallet', 'reminder'].map(term => <button key={term} type="button" onClick={() => { setQuery(term); chooseCategory('all'); }} className={`rounded-full border border-border px-2.5 py-1 hover:bg-accent hover:text-foreground ${focus}`}>{term}</button>)}
        </div>
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {featured.map(({ id, title, description, icon: Icon }) => <a key={id} href={`#${id}`} onClick={e => { e.preventDefault(); openArticle(id); }} className={`group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5 ${focus}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={20} /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
        <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </a>)}
    </div>

    <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-20">
        <nav aria-label="Help categories" className="rounded-xl border border-border bg-card p-3">
          <h2 className="px-3 pb-3 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Browse by topic</h2>
          <div className="flex gap-1 overflow-x-auto pb-1 lg:max-h-[calc(100vh-21rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
            {[{ id: 'all', title: 'All topics', icon: 'BookOpen' }, ...helpCategories].map(category => {
              const Icon = icons[category.icon];
              const count = category.id === 'all' ? allSearchResults.length : allSearchResults.filter(a => a.categoryId === category.id).length;
              return <button key={category.id} type="button" aria-pressed={categoryId === category.id} onClick={() => chooseCategory(category.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm lg:shrink ${focus} ${categoryId === category.id ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                <Icon size={16} aria-hidden="true" className="shrink-0" /><span className="whitespace-nowrap lg:whitespace-normal">{category.title}</span>
                <span className="ml-auto rounded-md bg-background/70 px-1.5 text-xs tabular-nums">{count}</span>
              </button>;
            })}
          </div>
        </nav>
        <div className="hidden rounded-xl border border-border bg-card p-4 text-sm lg:block">
          <ShieldCheck size={20} className="mb-2 text-primary" /><p className="font-semibold">Guides that match your access</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{isOwner ? 'You are an owner. Owner-only guides cover connections, team management, plan purchases and billing changes.' : 'You are a team member. Owner-only guides explain tasks your account owner needs to complete.'}</p>
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        <div id="help-results" tabIndex={-1} className="scroll-mt-24 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-semibold">{query.trim() ? 'Search results' : selectedCategory?.title || 'Explore all guides'}</h2>
              <p role="status" aria-live="polite" className="mt-1 text-sm text-muted-foreground">{results.length} {results.length === 1 ? 'guide' : 'guides'}{query.trim() ? ` for “${query.trim()}”` : ` across ${categoryId === 'all' ? helpCategories.length : 1} ${categoryId === 'all' ? 'topics' : 'topic'}`}.</p>
            </div>
            {results.length > 0 && <button type="button" onClick={() => setExpanded(previous => {
              const next = new Set(previous);
              results.forEach(a => { if (allExpanded) next.delete(a.id); else next.add(a.id); });
              return next;
            })} className={`rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent ${focus}`}>{allExpanded ? 'Collapse all' : 'Expand all'}</button>}
          </div>
        </div>
        {!isOwner && <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck size={14} className="mr-1 inline text-primary" />Owner-only guides are available for reference. Ask your account owner to perform those actions.</p>}
        {grouped.map(category => {
          const Icon = icons[category.icon];
          return <section key={category.id} aria-labelledby={`category-${category.id}`} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-5 py-4">
              <Icon size={20} aria-hidden="true" className="shrink-0 text-primary" />
              <div><h2 id={`category-${category.id}`} className="font-semibold">{category.title}</h2><p className="mt-1 text-xs text-muted-foreground">{category.description}</p></div>
            </div>
            <div className="divide-y divide-border">
              {category.articles.map(article => {
                const open = expanded.has(article.id);
                return <article key={article.id} id={article.id} className="scroll-mt-24">
                  <h3><button type="button" id={`question-${article.id}`} aria-expanded={open} aria-controls={`answer-${article.id}`} onClick={() => toggle(article.id)}
                    className={`flex w-full items-center gap-3 px-5 py-5 text-left transition-colors hover:bg-muted/30 ${focus}`}>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-6 sm:text-base">{article.title}</span>
                      {article.ownerOnly && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"><ShieldCheck size={11} />Owner only</span>}
                    </span>
                    <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button></h3>
                  <div id={`answer-${article.id}`} aria-labelledby={`question-${article.id}`} hidden={!open} className="px-5 pb-6 sm:px-6">
                    <div className="max-w-3xl space-y-5">
                      <p className="text-sm leading-6 text-muted-foreground">{article.purpose}</p>
                      <ol className="list-decimal space-y-3 pl-6 text-sm leading-6 marker:font-semibold marker:text-primary">
                        {article.steps.map((step, index) => <li key={index} className="pl-1">{step}</li>)}
                      </ol>
                      {article.example && <div className="rounded-lg border border-primary/15 bg-primary/5 p-4"><p className="mb-1 text-xs font-semibold text-primary">Practical example</p><p className="break-words text-sm leading-6">{article.example}</p></div>}
                      {article.note && <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="mb-1 text-xs font-semibold">Good to know</p><p className="text-sm leading-6 text-muted-foreground">{article.note}</p></div>}
                      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                        {article.ownerOnly && !isOwner ? <p className="text-xs text-muted-foreground">Ask an account owner to complete this task.</p> : <Link href={article.href} className={`inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline ${focus}`}>Open {destinationLabels[article.href] || article.categoryTitle}<ArrowRight size={14} /></Link>}
                        <button type="button" onClick={() => copyArticle(article.id)} className={`ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground ${focus}`}><Link2 size={14} />Copy guide link</button>
                      </div>
                      {article.related?.length > 0 && <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Related guides</p><div className="flex flex-col gap-2">
                        {article.related.map(id => <a key={id} href={`#${id}`} onClick={e => { e.preventDefault(); openArticle(id); }} className={`w-fit rounded-md text-sm text-primary hover:underline ${focus}`}>{articleById.get(id)?.title}</a>)}
                      </div></div>}
                    </div>
                  </div>
                </article>;
              })}
            </div>
          </section>;
        })}
        {!results.length && <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <Search size={30} className="mx-auto mb-3 text-muted-foreground" /><h3 className="font-semibold">No matching guides</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Try a shorter phrase such as “template”, “payment” or “code”, or search across all topics.</p>
          <button type="button" onClick={() => { setQuery(''); chooseCategory('all'); }} className={`mt-5 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent ${focus}`}>Clear search and filters</button>
        </div>}
        <section className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><LifeBuoy size={22} className="mt-0.5 shrink-0 text-primary" /><div><h2 className="font-semibold">Still need a hand?</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Send a support ticket with the error and the steps you tried. Keep passwords, codes and private keys out of your message.</p></div></div>
          <Link href="/client/tickets" className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 ${focus}`}>Support & Tickets<ArrowRight size={16} /></Link>
        </section>
      </div>
    </div>
    {copyNotice && <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lg"><Check size={16} className="shrink-0 text-primary" />{copyNotice}</div>}
  </div>;
}
