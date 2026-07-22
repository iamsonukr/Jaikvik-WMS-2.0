'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Select, Modal, Badge, Empty, Spinner } from '@/components/ui';
import { UsersRound, Plus } from 'lucide-react';
import api from '@/lib/api';

const PERMISSION_OPTIONS = ['clients:read', 'clients:write', 'wallet:credit', 'plans:write', 'pricing:write'];
const BLANK = { name: '', email: '', password: '', role: 'master', permissions: [] };

export default function StaffPage() {
  const [staff, setStaff] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/auth/staff').then((r) => setStaff(r.data));
  useEffect(() => { load(); }, []);

  const togglePermission = (perm) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(perm) ? f.permissions.filter((p) => p !== perm) : [...f.permissions, perm],
    }));
  };

  const create = async () => {
    setError('');
    if (!form.name || !form.email || form.password.length < 6) {
      setError('Name, email, and a password of at least 6 characters are required'); return;
    }
    setSaving(true);
    try {
      await api.post('/auth/staff', form);
      setModalOpen(false);
      setForm(BLANK);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not create staff account');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (member) => {
    await api.patch(`/auth/staff/${member._id}`, { isActive: !member.isActive });
    await load();
  };

  return (
    <AppShell allowedRoles={['admin']}>
      <PageHeader
        title="Staff & roles"
        subtitle="Admin and Master accounts for the platform team."
        action={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Add staff</Button>}
      />

      {!staff ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !staff.length ? (
        <Empty icon={UsersRound} title="No staff accounts yet" />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-border">
            {staff.map((s) => (
              <div key={s._id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge label={s.role === 'admin' ? 'Admin' : 'Master'} color={s.role === 'admin' ? 'blue' : 'gray'} />
                  <Badge label={s.isActive ? 'Active' : 'Disabled'} color={s.isActive ? 'green' : 'red'} />
                  <Button size="sm" variant="outline" onClick={() => toggleActive(s)}>
                    {s.isActive ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add staff account"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create account'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Temporary password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="master">Master</option>
            <option value="admin">Admin</option>
          </Select>
          {form.role === 'master' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Permissions</label>
              <div className="flex flex-wrap gap-2">
                {PERMISSION_OPTIONS.map((perm) => (
                  <button key={perm} type="button" onClick={() => togglePermission(perm)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${form.permissions.includes(perm) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'}`}>
                    {perm}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Modal>
    </AppShell>
  );
}
