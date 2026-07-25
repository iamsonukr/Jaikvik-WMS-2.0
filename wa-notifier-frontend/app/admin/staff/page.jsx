'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHeader, Card, Button, Input, Select, Modal, Badge, Empty, Spinner } from '@/components/ui';
import { UsersRound, Plus } from 'lucide-react';
import api from '@/lib/api';

const PERMISSION_OPTIONS = ['clients:read', 'clients:write', 'wallet:credit', 'plans:write'];
const BLANK = { name: '', email: '', password: '', role: 'master', permissions: [] };
const text = (value) => String(value || '').toLowerCase();
const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-IN') : '-';

export default function StaffPage() {
  const [staff, setStaff] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const filteredStaff = useMemo(() => {
    const query = text(search.trim());
    return (staff || []).filter((s) => {
      const permissions = (s.permissions || []).join(' ');
      const matchesSearch = !query
        || text(s.name).includes(query)
        || text(s.email).includes(query)
        || text(s.role).includes(query)
        || text(permissions).includes(query);
      const matchesRole = roleFilter === 'all' || s.role === roleFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && s.isActive)
        || (statusFilter === 'disabled' && !s.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [staff, search, roleFilter, statusFilter]);

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
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_160px_160px]">
            <Input placeholder="Search name, email, role, permission..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="master">Master</option>
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Staff member</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Permissions</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!filteredStaff.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No staff match these filters.</td></tr>
                )}
                {filteredStaff.map((s) => (
                  <tr key={s._id} className="table-row-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={s.role === 'admin' ? 'Admin' : 'Master'} color={s.role === 'admin' ? 'blue' : 'gray'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {s.role === 'admin' ? (
                          <Badge label="Full access" color="green" />
                        ) : (s.permissions || []).length ? (
                          s.permissions.map((permission) => <Badge key={permission} label={permission} color="gray" />)
                        ) : (
                          <span className="text-muted-foreground">No extra permissions</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={s.isActive ? 'Active' : 'Disabled'} color={s.isActive ? 'green' : 'red'} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => toggleActive(s)}>
                        {s.isActive ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add staff account"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? 'Creating...' : 'Create account'}</Button>
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
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Permissions</label>
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
