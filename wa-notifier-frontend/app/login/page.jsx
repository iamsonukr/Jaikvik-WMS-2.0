'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/components/theme-provider';
import { roleHomePath } from '@/hooks/useBasePath';
import { MessageCircle, Eye, EyeOff, Moon, Sun, ShieldCheck, Zap, Users2 } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';

const highlights = [
  { icon: Zap, text: 'Real-time broadcast delivery tracking' },
  { icon: Users2, text: 'Segmented contacts & multi-client workspaces' },
  { icon: ShieldCheck, text: 'Approved templates synced with WhatsApp' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await login(form.email, form.password);
      router.replace(roleHomePath(user.role));
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 text-foreground">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-gradient opacity-[0.12] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-brand-gradient opacity-[0.10] blur-3xl" />

      <button
        type="button"
        aria-label="Toggle theme"
        onClick={toggleTheme}
        className="fixed right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-all duration-200 hover:bg-accent hover:text-accent-foreground hover:rotate-12"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="hidden flex-1 pr-12 lg:block animate-fade-in">
          <div className="max-w-lg">
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              WhatsApp Business Operations
            </div>
            <h1 className="text-4xl font-bold tracking-tight">
              Run campaigns, replies, and clients from one clean command center.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              A focused dashboard for broadcast performance, template sync, inbox handling, and customer segmentation.
            </p>

            <div className="mt-8 space-y-3">
              {highlights.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient/10 text-primary">
                    <Icon size={16} />
                  </div>
                  <span className="text-foreground/90">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
              <MessageCircle size={24} color="#fff" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Jaikvik WMS</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to your dashboard</p>
            </div>
          </div>

          <Card className="p-6">
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="soft-alert border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300 animate-fade-in">{error}</div>
              )}

              <Input
                label="Email"
                type="email"
                required
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="you@example.com"
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    required
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Password"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="mt-2 w-full">
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </Card>

          <div className="mt-5 text-center text-xs text-muted-foreground">
            <Link href="/privacy-policy" className="font-medium text-primary hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
