'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Modal, Badge, Empty, Spinner } from '@/components/ui';
import { Building2, Plus, ArrowRight } from 'lucide-react';
import api from '@/lib/api';

const STATUS_COLOR = { active: 'green', suspended: 'yellow', disabled: 'red' };

export default function TenantsPage() {
  const [tenants, setTenants] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', contactEmail: '', contactPhone: '', industry: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/tenants').then((r) => setTenants(r.data));
  useEffect(() => { load(); }, []);

  const createTenant = async () => {
    setError('');
    if (!form.name || !form.contactEmail) { setError('Name and contact email are required'); return; }
    setSaving(true);
    try {
      await api.post('/tenants', form);
      setCreateOpen(false);
      setForm({ name: '', contactEmail: '', contactPhone: '', industry: '' });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not create client');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader
        title="Clients"
        subtitle="Every tenant onboarded to the platform."
        action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> Add client</Button>}
      />

      {!tenants ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !tenants.length ? (
        <Empty icon={Building2} title="No clients yet" description="Add your first client to get started." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-border">
            {tenants.map((t) => (
              <Link key={t._id} href={`/admin/tenants/${t._id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient/10 text-primary font-semibold text-sm">
                    {t.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.contactEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {t.planId?.name && <Badge label={t.planId.name} color="blue" />}
                  <Badge label={t.status} color={STATUS_COLOR[t.status] || 'gray'} />
                  <ArrowRight size={15} className="text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add a new client"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createTenant} disabled={saving}>{saving ? 'Creating…' : 'Create client'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Client / company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Contact email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          <Input label="Contact phone (optional)" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          <Input label="Industry (optional)" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
