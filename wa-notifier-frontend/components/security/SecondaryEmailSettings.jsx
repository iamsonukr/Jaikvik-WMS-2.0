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
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const cooldown = challenge ? Math.max(0, Math.ceil((new Date(challenge.resendAt).getTime() - now) / 1000)) : 0;
  const run = async (operation) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); } catch (err) { setError(getApiErrorMessage(err, 'Could not update secondary email.')); } finally { setBusy(false); }
  };
  if (user?.role === 'admin') return <Card className="max-w-xl p-6"><h2 className="font-semibold">OTP email recipients</h2><p className="mt-2 text-sm text-muted-foreground">Admin OTP recipients are configured by the server administrator. Choose a recipient when signing in.</p></Card>;
  return <Card className="mb-6 max-w-xl space-y-3 p-6">
    <h2 className="font-semibold">Secondary verification email</h2>
    <p className="text-sm text-muted-foreground">{user?.secondaryEmailVerifiedAt ? `Verified: ${user.secondaryEmail}. Login codes currently go to ${user.useSecondaryEmailForOtp ? 'this secondary email' : 'your registered email'}.` : 'Link another email and verify it before using it for login codes.'}</p>
    {!challenge ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); run(async () => {
      const { data } = await api.post('/auth/secondary-email/start', { email, currentPassword: password });
      setChallenge(data); setPassword(''); setNow(Date.now());
    }); }}>
      <Input label="Secondary email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <Input label="Current password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Send verification code</Button>
      {user?.secondaryEmailVerifiedAt && <Button type="button" variant="outline" disabled={busy || !password} onClick={() => run(async () => {
        const { data } = await api.patch('/auth/secondary-email/preference', { useSecondary: !user.useSecondaryEmailForOtp, currentPassword: password });
        setSession(data); setPassword(''); setMessage('OTP email preference updated.');
      })}>{user.useSecondaryEmailForOtp ? 'Use registered email for OTP' : 'Use secondary email for OTP'}</Button>}</div>
    </form> : <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); run(async () => {
      const { data } = await api.post('/auth/secondary-email/verify', { challengeToken: challenge.challengeToken, otp });
      setSession(data); setChallenge(null); setOtp(''); setEmail(''); setMessage('Secondary email verified and selected for login OTPs. Other sessions have been signed out.');
    }); }}>
      <p className="text-sm">Enter the code sent to {challenge.recipientLabel}. It expires in 5 minutes.</p>
      <Input label="Verification code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} />
      <Button type="submit" disabled={busy || otp.length !== 6}>Verify and link email</Button>
      <Button type="button" variant="outline" disabled={busy || cooldown > 0} onClick={() => run(async () => {
        const { data } = await api.post('/auth/secondary-email/resend', { challengeToken: challenge.challengeToken });
        setChallenge(data); setOtp(''); setNow(Date.now());
      })}>{cooldown ? `Resend in ${cooldown}s` : 'Resend OTP'}</Button>
      <button type="button" className="block text-sm text-primary" disabled={busy} onClick={() => { setChallenge(null); setOtp(''); }}>Cancel</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
  </Card>;
}
