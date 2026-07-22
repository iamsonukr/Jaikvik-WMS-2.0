'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, Eye, EyeOff } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { roleHomePath } from '@/hooks/useBasePath';
import { normalizeRole } from '@/lib/roles';
import api from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', companyName: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
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
          <Input placeholder="Your name" required value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Company name" required value={form.companyName}
            onChange={e => setForm({ ...form, companyName: e.target.value })} />
          <Input type="email" placeholder="Work email" required value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
          <div className="relative">
            <Input type={show ? 'text' : 'password'} placeholder="Password (min. 6 characters)" required minLength={6}
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating your account…' : 'Start free trial'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Log in</Link>
        </p>
      </Card>
    </div>
  );
}
