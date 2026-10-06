'use client';
import { useState } from 'react';
import { Button, Input, Modal, Select } from '@/components/ui';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import AccountSecuritySummary from './AccountSecuritySummary';

export default function AdminTwoFactorControl({ member, onUpdated }) {
  const { setSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(member.twoFactorEnabled ? 'disable' : member.emailVerified ? 'enable' : 'reset');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.patch(`/auth/users/${member._id}/2fa`, { action, currentPassword: password });
      if (data.access_token) setSession(data);
      setOpen(false); setPassword(''); onUpdated?.(data.user);
    } catch (err) { setError(getApiErrorMessage(err, 'Could not update 2FA.')); }
    finally { setBusy(false); }
  };
  return <>
    <div className="min-w-[230px] space-y-3"><AccountSecuritySummary member={member} /><Button size="sm" variant="outline" onClick={() => { setAction(member.twoFactorEnabled ? 'disable' : member.emailVerified ? 'enable' : 'reset'); setOpen(true); setError(''); setPassword(''); }}>Manage security</Button></div>
    <Modal open={open} onClose={() => { if (!busy) { setOpen(false); setPassword(''); } }} title={`Manage security: ${member.name || member.email}`} footer={<Button onClick={save} disabled={busy || !password}>{busy ? 'Saving...' : 'Confirm'}</Button>}>
      <div className="space-y-3">
        <AccountSecuritySummary member={member} />
        <Select label="Action" value={action} onChange={(event) => setAction(event.target.value)}><option value="enable" disabled={!member.emailVerified}>Force-enable 2FA{!member.emailVerified ? ' (verify registered email first)' : ''}</option><option value="disable">Force-disable 2FA</option><option value="reset">Reset pending codes and sessions</option>{member.role !== 'admin' && member.secondaryEmail && <option value="remove-secondary">Remove secondary email and use registered email</option>}</Select>
        <p className="text-sm text-muted-foreground">All actions clear pending codes and sign out existing sessions. Reset keeps the current 2FA setting.</p>
        <Input label="Your current admin password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      </div>
    </Modal>
  </>;
}
