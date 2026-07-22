'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Card, Input, Button, PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [pw,      setPw]      = useState({ current: '', next: '', confirm: '' });
  const [saved,   setSaved]   = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // user loads asynchronously after the auth check resolves — sync the form once it's available
  useEffect(() => {
    if (user) setProfile({ name: user.name || '', email: user.email || '' });
  }, [user]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.patch('/auth/me', { name: profile.name, email: profile.email });
      setSaved('Profile updated!');
    } catch (err) {
      setSaved('Error: ' + (err?.response?.data?.message || 'Could not update profile'));
    } finally {
      setSavingProfile(false);
    }
    setTimeout(() => setSaved(''), 4000);
  };

  const savePassword = async () => {
    if (!pw.current) { alert('Enter your current password'); return; }
    if (pw.next.length < 6) { alert('New password must be at least 6 characters'); return; }
    if (pw.next !== pw.confirm) { alert('New passwords do not match'); return; }
    setSavingPw(true);
    try {
      await api.patch('/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      setSaved('Password updated!');
    } catch (err) {
      setSaved('Error: ' + (err?.response?.data?.message || 'Could not update password'));
    } finally {
      setSavingPw(false);
    }
    setTimeout(() => setSaved(''), 4000);
  };

  // The webhook is served by the standalone BACKEND, not this frontend — use NEXT_PUBLIC_API_URL
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
  const webhookUrl = `${apiBase}/api/webhooks/meta`;

  return (
    <AppShell allowedRoles={['admin', 'master']}>
      <PageHeader title="Settings" />

      <div className="max-w-xl space-y-5">
        {/* Profile */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-sm">Profile</h3>
          <Input label="Name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
          <Input label="Email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
          <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save Profile'}</Button>
        </Card>

        {/* Password */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-sm">Change Password</h3>
          <Input label="Current Password" type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
          <Input label="New Password" type="password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
          <Input label="Confirm New Password" type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
          <Button onClick={savePassword} disabled={savingPw}>{savingPw ? 'Updating…' : 'Update Password'}</Button>
        </Card>

        {/* Webhook info */}
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold text-sm">Meta Webhook Configuration</h3>
          <p className="text-xs text-[var(--muted-text)]">Add this URL to your Meta App's WhatsApp webhook configuration. Meta requires a publicly reachable HTTPS URL — if your backend is running locally, use a tunnel (e.g. ngrok) for testing.</p>
          <div className="bg-muted/70 rounded-lg px-3 py-2.5 font-mono text-xs break-all border border-border">
            {webhookUrl}
          </div>
          <div>
            <p className="text-xs text-[var(--muted-text)] mb-1">Verify Token</p>
            <div className="bg-muted/70 rounded-lg px-3 py-2.5 font-mono text-xs border border-border">
              wa_notifier_verify <span className="text-[var(--muted-text)]">(set META_VERIFY_TOKEN in .env)</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted-text)] mb-1">Subscribe to these webhook fields:</p>
            <div className="flex gap-2 flex-wrap">
              {['messages', 'message_deliveries', 'message_reads', 'account_alerts'].map(f => (
                <span key={f} className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{f}</span>
              ))}
            </div>
          </div>
        </Card>

        {saved && (
          <div className="soft-alert border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300">{saved}</div>
        )}
      </div>
    </AppShell>
  );
}
