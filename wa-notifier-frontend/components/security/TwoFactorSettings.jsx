'use client';
import { useEffect, useState } from 'react';
import { Button, Card, Input, Badge } from '@/components/ui';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import SecondaryEmailSettings from './SecondaryEmailSettings';

export default function TwoFactorSettings() {
  const { setSession } = useAuth();
  const [enabled, setEnabled] = useState(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api.get('/auth/me').then(({ data }) => setEnabled(Boolean(data.twoFactorEnabled))).catch(() => setError('Could not load security settings.')); }, []);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await api.patch('/auth/2fa', { enabled: !enabled, currentPassword: password });
      setSession(data); setEnabled(Boolean(data.user.twoFactorEnabled)); setPassword('');
      setMessage(`Two-factor authentication ${data.user.twoFactorEnabled ? 'enabled' : 'disabled'}. Other sessions have been signed out.`);
    } catch (err) { setError(getApiErrorMessage(err, 'Could not update two-factor authentication.')); }
    finally { setBusy(false); }
  };
  return <><Card className="mb-6 max-w-xl p-6">
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Email two-factor authentication</h2><Badge label={enabled == null ? 'Loading' : enabled ? 'Enabled' : 'Disabled'} color={enabled ? 'green' : 'gray'} /></div>
      <p className="text-sm text-muted-foreground">Require an email verification code at sign-in. Confirm your current password to change this setting.</p>
      <Input label="Current password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      <Button type="submit" disabled={busy || enabled == null || !password}>{busy ? 'Saving...' : enabled ? 'Disable 2FA' : 'Enable 2FA'}</Button>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
    </form>
  </Card><SecondaryEmailSettings /></>;
}
