'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageCircle, Megaphone, Send, Users2, FileText, BarChart2, ShieldCheck,
  Zap, Check, ChevronDown, Moon, Sun, ArrowRight,
} from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import { roleHomePath } from '@/hooks/useBasePath';

const features = [
  { icon: Megaphone, title: 'Bulk campaigns', text: 'Send approved WhatsApp templates to thousands of contacts in segmented batches, with live delivery tracking.' },
  { icon: Send, title: 'Shared team inbox', text: 'Reply to customers as a team, assign conversations, and never lose a thread across agents.' },
  { icon: FileText, title: 'Template & campaign sync', text: 'Templates sync straight from Meta — approved, pending, and rejected statuses stay current automatically.' },
  { icon: Users2, title: 'Segmented contacts', text: 'Tag, group, and target contacts precisely instead of blasting your entire list every time.' },
  { icon: BarChart2, title: 'Real dashboards', text: 'Sent, delivered, read, and failed — broken down by campaign, template, and day.' },
  { icon: ShieldCheck, title: 'Wallet-based billing', text: 'Transparent per-message pricing with a prepaid wallet, so spend never surprises you.' },
];

const faqs = [
  { q: 'Do I need my own WhatsApp Business API access?', a: 'No — we handle the Meta Business API connection for you through an embedded signup flow when you onboard your WhatsApp number.' },
  { q: 'How does message pricing work?', a: 'Every message category (marketing, utility, authentication, service) has a transparent per-message price, deducted from a prepaid wallet you top up via Razorpay. You always see the cost before you send.' },
  { q: 'Can I change plans later?', a: 'Yes — upgrade, downgrade, or cancel anytime from your dashboard. Your current usage and wallet balance carry over.' },
  { q: 'Is there a free trial?', a: 'Starter, Growth, and Advanced plans include a trial period — start sending in minutes, no credit card required upfront.' },
];

function Header({ theme, toggleTheme }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-glow">
            <MessageCircle size={18} color="#fff" />
          </div>
          <span className="font-bold tracking-tight">Jaikvik WMS</span>
        </div>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-all hover:bg-accent"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link href="/login"><Button variant="outline" size="sm">Log in</Button></Link>
          <Link href="/signup"><Button size="sm">Start free trial</Button></Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-gradient opacity-[0.12] blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-40 h-96 w-96 rounded-full bg-brand-gradient opacity-[0.10] blur-3xl" />
      <div className="relative mx-auto max-w-3xl text-center animate-fade-in">
        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          WhatsApp Business marketing, done right
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Run WhatsApp campaigns, replies, and billing from one dashboard.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          Bulk messaging, shared inbox, template sync, and transparent per-message pricing —
          built for teams who take WhatsApp marketing seriously.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup"><Button size="lg">Start free trial <ArrowRight size={16} /></Button></Link>
          <a href="#pricing"><Button variant="outline" size="lg">See pricing</Button></a>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Everything your team needs on WhatsApp</h2>
          <p className="mt-3 text-sm text-muted-foreground">No plugins, no duct tape — one platform for sending, replying, and reporting.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient/10 text-primary">
                <Icon size={20} />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 text-xs text-muted-foreground">app.jaikvikwms.com/dashboard</span>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-3">
            {[
              { label: 'Messages sent', value: '128,402', color: '#25D366' },
              { label: 'Delivery rate', value: '98.4%', color: '#3b82f6' },
              { label: 'Wallet balance', value: '₹24,180', color: '#f59e0b' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border p-4">
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}



const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly'];
const CYCLE_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

function priceForCycle(plan, cycle) {
  if (plan.price == null) return 'Price on request';
  const price = typeof plan.price === 'number' ? { quarterly: plan.price } : plan.price;
  const value = price?.[cycle];
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
}

function formatPrice(plan, cycle) {
  const price = priceForCycle(plan, cycle);
  if (price === 'Price on request') return price;
  if (price === null) return 'Not available';
  return `₹${price.toLocaleString('en-IN')}`;
}

function cycleLabel(cycle) {
  return { monthly: '/month', quarterly: '/quarter', yearly: '/year', custom: '' }[cycle] || '';
}

function featureLines(features) {
  if (Array.isArray(features)) return features.filter(Boolean);
  return Object.entries(features || {})
    .filter(([, value]) => value === true || typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => value === true ? key.replace(/([A-Z])/g, ' $1').toLowerCase() : `${key}: ${value}`);
}

function Pricing() {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(false);
  const [billingCycle, setBillingCycle] = useState('quarterly');

  useEffect(() => {
    api.get('/plans/public').then(r => setPlans(r.data)).catch(() => setError(true));
  }, []);

  return (
    <section id="pricing" className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
          <p className="mt-3 text-sm text-muted-foreground">Plus applicable taxes. Change or cancel anytime.</p>
          <div className="mt-5 inline-flex rounded-lg border border-border bg-muted/40 p-1">
            {BILLING_CYCLES.map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={`h-9 rounded-md px-4 text-xs font-medium transition-colors ${billingCycle === cycle ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {CYCLE_LABELS[cycle]}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-center text-sm text-muted-foreground">
            Pricing is temporarily unavailable — please check back shortly.
          </p>
        )}

        {!error && !plans && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-80 animate-pulse rounded-xl bg-muted/50" />)}
          </div>
        )}

        {plans && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <Card key={plan._id} className={`relative flex flex-col p-6 ${plan.isPopular ? 'ring-2 ring-primary' : ''}`}>
                {plan.isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold text-white shadow-glow">
                    Most popular
                  </span>
                )}
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                <div className="mt-4">
                  <span className="text-3xl font-bold">{formatPrice(plan, billingCycle)}</span>
                  {typeof priceForCycle(plan, billingCycle) === 'number' && (
                    <span className="text-sm text-muted-foreground">{cycleLabel(billingCycle)}</span>
                  )}
                </div>
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {Object.entries(plan.limits || {}).slice(0, 4).map(([key, value]) => (
                    <li key={key} className="flex items-center gap-2 text-muted-foreground">
                      <Check size={14} className="shrink-0 text-emerald-500" />
                      {value === true ? key : `${value} ${key}`}
                    </li>
                  ))}
                  {featureLines(plan.features).slice(0, 6).map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-muted-foreground">
                      <Check size={14} className="shrink-0 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="mt-6">
                  <Button className="w-full" variant={plan.isPopular ? 'primary' : 'outline'}>{plan.buttonText}</Button>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);
  return (
    <section id="faq" className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-8 text-center text-3xl font-bold tracking-tight">Frequently asked questions</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <Card key={f.q} className="overflow-hidden p-0">
              <button
                onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium"
              >
                {f.q}
                <ChevronDown size={16} className={`shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
              </button>
              {openIndex === i && (
                <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">{f.a}</p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactCTA() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Card className="flex flex-col items-center gap-5 p-10 text-center">
          <Zap size={28} className="text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">Ready to put WhatsApp to work?</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Start your free trial in minutes, or talk to us about an Enterprise plan built around your volume.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/signup"><Button size="lg">Start free trial</Button></Link>
            <a href="mailto:sales@jaikvikwms.com"><Button variant="outline" size="lg">Contact sales</Button></a>
          </div>
        </Card>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient">
            <MessageCircle size={14} color="#fff" />
          </div>
          <span className="font-medium text-foreground">Jaikvik WMS</span>
        </div>
        <p>© {new Date().getFullYear()} Jaikvik WMS. All rights reserved.</p>
        <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
      </div>
    </footer>
  );
}

export default function PublicHomePage() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(roleHomePath(user.role));
    }
  }, [loading, router, user]);

  if (loading || user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header theme={theme} toggleTheme={toggleTheme} />
      <Hero />
      <Features />
      <DashboardPreview />
      <Pricing />
      <FAQ />
      <ContactCTA />
      <Footer />
    </div>
  );
}
