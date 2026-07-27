'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import {
  KeyRound, Mail, Plus, ShieldCheck, Trash2, UserCircle2, Users,
} from 'lucide-react';

const blankInvite = { name: '', email: '', password: '', role: 'client_user' };

function normalizeMember(member) {
  return {
    ...member,
    _id: member?._id || member?.id,
    name: member?.name || '',
    email: member?.email || '',
    role: member?.role || 'client_user',
    isActive: member?.isActive !== false,
  };
}

function fmtLimit(value) {
  if (value === null || value === undefined || value === '') return 'Unlimited';
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN') : String(value);
}

export default function TeamWorkspace() {
  const { user } = useAuth();
  const isOwner = user?.role === 'client_owner';

  const [members, setMembers] = useState([]);
  const [limit, setLimit] = useState({ used: 0, limit: null, remaining: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [inviteModal, setInviteModal] = useState(false);
  const [invite, setInvite] = useState(blankInvite);
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);

  const [pwModal, setPwModal] = useState(null); // member being reset
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [teamRes, limitRes] = await Promise.all([
        api.get('/auth/team'),
        api.get('/auth/team/limit').catch(() => ({ data: { used: 0, limit: null, remaining: null } })),
      ]);
      setMembers((Array.isArray(teamRes.data) ? teamRes.data : []).map(normalizeMember));
      setLimit(limitRes.data || { used: 0, limit: null, remaining: null });
    } catch (err) {
      setLoadError(err?.response?.data?.message || 'Failed to load your team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const limitReached = limit.limit !== null && limit.limit !== undefined && limit.used >= Number(limit.limit);

  const openInvite = () => {
    setInvite(blankInvite);
    setInviteError('');
    setInviteModal(true);
  };

  const submitInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    if (!invite.name.trim() || !invite.email.trim() || invite.password.length < 6) {
      setInviteError('Name, email, and a password of at least 6 characters are required.');
      return;
    }
    setInviting(true);
    try {
      await api.post('/auth/team', invite);
      setInviteModal(false);
      setNotice('Team member invited');
      await load();
    } catch (err) {
      setInviteError(err?.response?.data?.message || 'Failed to invite team member');
    } finally {
      setInviting(false);
    }
  };

  const toggleActive = async (member) => {
    setRowBusyId(member._id);
    try {
      await api.patch(`/auth/team/${member._id}`, { isActive: !member.isActive });
      setNotice(member.isActive ? 'Team member disabled' : 'Team member activated');
      await load();
    } catch (err) {
      setLoadError(err?.response?.data?.message || 'Failed to update team member');
    } finally {
      setRowBusyId(null);
    }
  };

  const changeRole = async (member, role) => {
    if (role === member.role) return;
    setRowBusyId(member._id);
    try {
      await api.patch(`/auth/team/${member._id}`, { role });
      setNotice('Role updated');
      await load();
    } catch (err) {
      setLoadError(err?.response?.data?.message || 'Failed to update role');
    } finally {
      setRowBusyId(null);
    }
  };

  const openPasswordReset = (member) => {
    setPwModal(member);
    setNewPassword('');
    setPwError('');
  };

  const submitPasswordReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    setPwSaving(true);
    setPwError('');
    try {
      await api.patch(`/auth/team/${pwModal._id}/password`, { newPassword });
      setPwModal(null);
      setNotice('Password reset');
    } catch (err) {
      setPwError(err?.response?.data?.message || 'Failed to reset password');
    } finally {
      setPwSaving(false);
    }
  };

  const confirmRemove = async () => {
    setRemoving(true);
    try {
      await api.delete(`/auth/team/${removeTarget._id}`);
      setRemoveTarget(null);
      setNotice('Team member removed');
      await load();
    } catch (err) {
      setLoadError(err?.response?.data?.message || 'Failed to remove team member');
      setRemoveTarget(null);
    } finally {
      setRemoving(false);
    }
  };

  const usageLabel = useMemo(
    () => `${limit.used} / ${fmtLimit(limit.limit)} team member${limit.used === 1 ? '' : 's'} used`,
    [limit],
  );

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Invite teammates, manage roles, and control access to your workspace."
        action={isOwner && (
          <Button onClick={openInvite} disabled={limitReached}>
            <Plus size={16} /> Invite team member
          </Button>
        )}
      />

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}
      {loadError && (
        <div className="mb-4 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <Card className="mb-5 flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold">{usageLabel}</p>
            <p className="text-xs text-muted-foreground">Based on your current plan's team member limit.</p>
          </div>
        </div>
        {limitReached && (
          <Badge color="yellow" label="Limit reached — upgrade your plan to add more" />
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Users size={28} className="text-muted-foreground" />
            <p className="font-semibold">No team members yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">Invite your first teammate to help manage broadcasts, contacts, and inbox conversations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => {
                  const isSelf = member._id === user?.id;
                  const busy = rowBusyId === member._id;
                  return (
                    <tr key={member._id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <UserCircle2 size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{member.name}{isSelf && <span className="text-muted-foreground"> (you)</span>}</p>
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Mail size={11} />{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isOwner ? (
                          <Select
                            value={member.role}
                            disabled={busy}
                            onChange={(e) => changeRole(member, e.target.value)}
                            className="h-9 w-40"
                          >
                            <option value="client_owner">Owner</option>
                            <option value="client_user">Team member</option>
                          </Select>
                        ) : (
                          <Badge color={member.role === 'client_owner' ? 'blue' : 'gray'} label={member.role === 'client_owner' ? 'Owner' : 'Team member'} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={member.isActive ? 'green' : 'red'} label={member.isActive ? 'Active' : 'Disabled'} />
                      </td>
                      <td className="px-4 py-3">
                        {isOwner && (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="outline" size="sm"
                              onClick={() => openPasswordReset(member)}
                              title="Reset password"
                            >
                              <KeyRound size={14} />
                            </Button>
                            <Button
                              variant="outline" size="sm"
                              disabled={busy || isSelf}
                              onClick={() => toggleActive(member)}
                              title={member.isActive ? 'Disable' : 'Activate'}
                            >
                              <ShieldCheck size={14} />
                            </Button>
                            <Button
                              variant="outline" size="sm"
                              disabled={isSelf}
                              onClick={() => setRemoveTarget(member)}
                              title="Remove"
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={inviteModal}
        onClose={() => setInviteModal(false)}
        title="Invite team member"
        footer={(
          <>
            <Button variant="outline" onClick={() => setInviteModal(false)}>Cancel</Button>
            <Button onClick={submitInvite} disabled={inviting}>{inviting ? 'Inviting…' : 'Send invite'}</Button>
          </>
        )}
      >
        <form onSubmit={submitInvite} className="flex flex-col gap-3">
          {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
          <Input label="Full name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} required />
          <Input label="Email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
          <Input label="Temporary password" type="password" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} required />
          <Select label="Role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="client_user">Team member</option>
            <option value="client_owner">Owner</option>
          </Select>
        </form>
      </Modal>

      <Modal
        open={!!pwModal}
        onClose={() => setPwModal(null)}
        title={`Reset password — ${pwModal?.name || ''}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setPwModal(null)}>Cancel</Button>
            <Button onClick={submitPasswordReset} disabled={pwSaving}>{pwSaving ? 'Saving…' : 'Reset password'}</Button>
          </>
        )}
      >
        <form onSubmit={submitPasswordReset} className="flex flex-col gap-3">
          {pwError && <p className="text-sm text-destructive">{pwError}</p>}
          <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </form>
      </Modal>

      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove team member"
        footer={(
          <>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmRemove} disabled={removing}>{removing ? 'Removing…' : 'Remove'}</Button>
          </>
        )}
      >
        <p className="text-sm text-muted-foreground">
          Remove <strong>{removeTarget?.name}</strong> ({removeTarget?.email}) from your team? They will immediately lose access.
        </p>
      </Modal>
    </div>
  );
}
