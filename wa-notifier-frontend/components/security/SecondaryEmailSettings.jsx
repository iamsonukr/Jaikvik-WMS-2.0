'use client';
import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import api, { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
export default function SecondaryEmailSettings() {
  const { user, setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const [retryAt, setRetryAt] = useState(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const cooldown = challenge ? Math.max(0, Math.ceil((new Date(challenge.resendAt).getTime() - now) / 1000)) : 0;
  const requestCooldown = retryAt ? Math.max(0, Math.ceil((new Date(retryAt).getTime() - now) / 1000)) : 0;
  const run = async (operation) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setRetryAt(null); } catch (err) {
      setError(getApiErrorMessage(err, 'Could not update secondary email.'));
      if (err.response?.status === 429 && err.response.data?.retryAt) { setRetryAt(err.response.data.retryAt); setNow(Date.now()); }
    } finally { setBusy(false); }
  };
  return <Card className="mb-6 max-w-xl space-y-3 p-6">
    <h2 className="font-semibold">Secondary verification email</h2>
    <p className="text-sm text-muted-foreground">Primary email: {user?.email}. {user?.secondaryEmailVerifiedAt ? `Verified secondary email: ${user.secondaryEmail}.` : 'Link and verify another email to manage your account emails.'} {user?.role === 'admin' ? 'Choose an OTP recipient from the configured admin list at login.' : 'Choose your OTP email at login.'}</p>
    {!challenge ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); run(async () => {
      const { data } = await api.post('/auth/secondary-email/start', { email, currentPassword: password });
      setChallenge(data); setPassword(''); setNow(Date.now());
    }); }}>
      <Input label="Secondary email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <Input label="Current password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || requestCooldown > 0}>{requestCooldown ? `Try again in ${requestCooldown}s` : 'Send verification code'}</Button>
      {user?.secondaryEmailVerifiedAt && <Button type="button" variant="outline" disabled={busy || !password} onClick={() => run(async () => {
        const { data } = await api.delete('/auth/account-email', { data: { emailType: 'secondary', currentPassword: password } });
        setSession(data); setPassword(''); setMessage('Secondary email removed. Other sessions have been signed out.');
      })}>Remove secondary email</Button>}
      {user?.secondaryEmailVerifiedAt && <Button type="button" variant="outline" disabled={busy || !password} onClick={() => run(async () => {
        const { data } = await api.delete('/auth/account-email', { data: { emailType: 'primary', currentPassword: password } });
        setSession(data); setPassword(''); setEmail(''); setMessage('Primary email removed. Your verified secondary email is now your primary email and login address. Other sessions have been signed out.');
      })}>Remove primary and use secondary</Button>}</div>
    </form> : <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); run(async () => {
      const { data } = await api.post('/auth/secondary-email/verify', { challengeToken: challenge.challengeToken, otp });
      setSession(data); setChallenge(null); setOtp(''); setEmail(''); setMessage('Secondary email verified. Other sessions have been signed out.');
    }); }}>
      <p className="text-sm">Enter the code sent to {challenge.recipientLabel}. It expires in 5 minutes.</p>
      <Input label="Verification code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} />
      <Button type="submit" disabled={busy || otp.length !== 6}>Verify and link email</Button>
      <Button type="button" variant="outline" disabled={busy || cooldown > 0 || requestCooldown > 0} onClick={() => run(async () => {
        const { data } = await api.post('/auth/secondary-email/resend', { challengeToken: challenge.challengeToken });
        setChallenge(data); setOtp(''); setNow(Date.now());
      })}>{Math.max(cooldown, requestCooldown) ? `Resend in ${Math.max(cooldown, requestCooldown)}s` : 'Resend OTP'}</Button>
      <button type="button" className="block text-sm text-primary" disabled={busy} onClick={() => { setChallenge(null); setOtp(''); }}>Cancel</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
  </Card>;
}
