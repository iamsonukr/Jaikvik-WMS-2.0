'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { roleHomePath } from '@/hooks/useBasePath';
import { normalizeRole } from '@/lib/roles';
import api from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', companyName: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const cooldown = challenge ? Math.max(0, Math.ceil((new Date(challenge.resendAt).getTime() - now) / 1000)) : 0;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!challenge) {
        const { data } = await api.post('/auth/register/start', { email: form.email });
        setChallenge(data); setNow(Date.now());
        return;
      }
      const { data } = await api.post('/auth/register', { ...form, challengeToken: challenge.challengeToken, otp });
      setForm((previous) => ({ ...previous, password: '' }));
      setSession(data);
      const role = normalizeRole(data.user.role);
      router.replace(role === 'client_owner' ? '/client/connect-whatsapp' : roleHomePath(role));
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not create your account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient shadow-glow">
            <MessageCircle size={20} color="#fff" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Start your free trial</h1>
          <p className="mt-1 text-sm text-muted-foreground">No credit card required to get started.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {!challenge ? <>
          <Input placeholder="Your name" required value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Company name" required value={form.companyName}
            onChange={e => setForm({ ...form, companyName: e.target.value })} />
          <Input type="email" placeholder="Work email" required value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input type="password" placeholder="Password (min. 6 characters)" required minLength={6}
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </> : <>
            <p className="text-sm text-muted-foreground">Verify {challenge.recipientLabel} to create your account. Your code expires in 5 minutes.</p>
            <Input label="Verification code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} />
            <Button type="button" variant="outline" disabled={loading || cooldown > 0} onClick={async () => {
              setLoading(true); setError('');
              try { const { data } = await api.post('/auth/register/resend', { challengeToken: challenge.challengeToken }); setChallenge(data); setOtp(''); setNow(Date.now()); }
              catch (err) { setError(err.response?.data?.message || 'Could not resend verification code.'); }
              finally { setLoading(false); }
            }}>{cooldown ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}</Button>
            <button type="button" disabled={loading} className="block text-sm text-primary" onClick={() => { setChallenge(null); setOtp(''); setError(''); }}>Change account details</button>
          </>}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Please wait...' : challenge ? 'Verify and create account' : 'Send verification code'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Log in</Link>
        </p>
      </Card>
    </div>
  );
}
