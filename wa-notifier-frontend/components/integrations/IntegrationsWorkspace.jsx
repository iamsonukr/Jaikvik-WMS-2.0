'use client';
import Link from 'next/link';
import { ArrowRight, FileSpreadsheet, Plug, Zap } from 'lucide-react';
import { buttonVariants } from '@/components/ui';

export default function IntegrationsWorkspace({ basePath }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Plug size={25} />Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connect your business apps to sync data and automate WhatsApp workflows.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400"><FileSpreadsheet size={26} /></div>
            <h2 className="text-lg font-semibold">Google Sheets</h2>
          </div>
          <p className="flex-1 text-sm text-muted-foreground">Sync contacts, send personalized messages and reminders, and export leads and message reports to your spreadsheets.</p>
          <Link href={`${basePath}/integrations/google-sheets`} className={buttonVariants({ variant: 'outline' })}>
            Manage Google Sheets<ArrowRight size={16} />
          </Link>
        </article>
        <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-3 text-orange-600 dark:text-orange-400"><Zap size={26} /></div>
            <h2 className="text-lg font-semibold">Zapier</h2>
          </div>
          <p className="flex-1 text-sm text-muted-foreground">Connect your apps to create contacts, send WhatsApp templates, and trigger Zaps from incoming messages and delivery updates.</p>
          <Link href={`${basePath}/integrations/zapier`} className={buttonVariants({ variant: 'outline' })}>
            Manage Zapier<ArrowRight size={16} />
          </Link>
        </article>
      </div>
    </div>
  );
}
