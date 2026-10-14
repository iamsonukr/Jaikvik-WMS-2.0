import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { helpArticles, helpCategories, searchHelp } from '../lib/client-help.mjs';

const root = new URL('../', import.meta.url);
test('every client menu module has a guide with a working application destination', () => {
  const sidebar = readFileSync(new URL('components/layout/Sidebar.jsx', root), 'utf8');
  const clientMenu = ['clientNav', 'clientSupportNav'].map(name => sidebar.split(`const ${name} = [`)[1].split('];')[0]).join('\n');
  const routes = [...clientMenu.matchAll(/href:\s*'([^']+)'/g)].map(match => match[1]).filter(route => route !== '/client/help');
  for (const route of routes) assert.ok(helpArticles.some(article => article.href === route), `Missing client module: ${route}`);
  for (const article of helpArticles) {
    assert.ok(existsSync(new URL(`app${article.href}/page.jsx`, root)), `Broken destination: ${article.id} → ${article.href}`);
  }
});
test('guides have unique shareable IDs, detailed steps and valid related articles', () => {
  const ids = new Set(helpArticles.map(article => article.id));
  assert.equal(ids.size, helpArticles.length);
  assert.equal(new Set(helpCategories.map(category => category.id)).size, helpCategories.length);
  for (const article of helpArticles) {
    assert.match(article.id, /^[a-z0-9-]+$/);
    assert.ok(article.purpose.length > 30, article.id);
    assert.ok(article.steps.length >= 4, article.id);
    assert.ok(article.steps.every(step => typeof step === 'string' && step.trim().length > 20), article.id);
    for (const id of article.related || []) assert.ok(ids.has(id), `${article.id}: broken related link ${id}`);
  }
});
test('search finds instructions, errors and examples across all categories', () => {
  assert.ok(searchHelp('  CSV IMPORT  ').some(article => article.id === 'csv-import'));
  assert.ok(searchHelp('country code').some(article => article.id === 'add-contact'));
  assert.ok(searchHelp('needs_review').some(article => article.id === 'uncertain-send'));
  assert.ok(searchHelp('A123').some(article => article.id === 'contact-message'));
  assert.deepEqual(searchHelp('no-such-feature-xyz'), []);
  assert.equal(searchHelp('   ').length, helpArticles.length);
});
test('category filtering composes with multiword search and clearing restores all guides', () => {
  const result = searchHelp('template', 'integrations');
  assert.ok(result.length > 0);
  assert.ok(result.every(article => article.categoryId === 'integrations'));
  assert.equal(searchHelp('', 'contacts').length, helpCategories.find(category => category.id === 'contacts').guides.length);
  assert.equal(searchHelp('', 'all').length, helpArticles.length);
});
test('owner-only destinations and management tasks are identified for team members', () => {
  for (const article of helpArticles.filter(article => article.href.startsWith('/client/integrations') || article.href === '/client/connect-whatsapp')) {
    assert.equal(article.ownerOnly, true, article.id);
  }
  for (const id of ['team-invite', 'team-access', 'purchase-plan', 'billing-details']) {
    assert.equal(helpArticles.find(article => article.id === id).ownerOnly, true, id);
  }
  assert.equal(helpArticles.find(article => article.id === 'wallet-recharge').ownerOnly, false);
});
test('each implemented integration has its own complete walkthrough', () => {
  for (const [id, route] of [['sheets-sync', 'google-sheets'], ['calendar-reminders', 'google-calendar'], ['calendly-bookings', 'calendly'], ['zapier-actions', 'zapier']]) {
    const article = helpArticles.find(article => article.id === id);
    assert.ok(article.steps.length >= 7, id);
    assert.equal(article.href, `/client/integrations/${route}`);
  }
});
