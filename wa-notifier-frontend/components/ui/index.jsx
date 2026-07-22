import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

export { Button, buttonVariants } from './button';
export { Card, CardHeader, CardContent } from './card';
export { Input, Select, Textarea } from './input';
export { Badge } from './badge';
export { Skeleton } from './skeleton';
export { Avatar, AvatarImage, AvatarFallback } from './avatar';
export {
  Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent,
  DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from './dialog';

import { Card } from './card';
import { Badge } from './badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';

export function StatCard({ label, value, icon: Icon, color = '#25D366', sub, trend }) {
  const trendUp = typeof trend === 'number' && trend >= 0;
  return (
    <Card className="group relative overflow-hidden p-4 sm:p-5">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.10] transition-transform duration-300 group-hover:scale-125"
        style={{ background: color }}
      />
      <div className="relative flex items-start gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset transition-transform duration-200 group-hover:scale-105"
          style={{ background: color + '18', color, borderColor: color + '30', boxShadow: `inset 0 0 0 1px ${color}25` }}
        >
          {Icon && <Icon size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight">{value ?? '—'}</p>
          <div className="mt-1 flex items-center gap-1.5">
            {typeof trend === 'number' && (
              <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(trend)}%
              </span>
            )}
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Empty({ icon: Icon, title, description, action }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-4 py-16 text-center animate-fade-in">
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient/10 text-primary">
          <Icon size={28} strokeWidth={1.75} />
        </div>
      )}
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function Spinner({ size = 20 }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full border-2 border-primary/25 border-t-primary animate-spin"
    />
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between animate-fade-in">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    approved: ['green', 'Approved'], pending: ['yellow', 'Pending'], rejected: ['red', 'Rejected'],
    done: ['green', 'Done'], running: ['blue', 'Running'], draft: ['gray', 'Draft'],
    queued: ['yellow', 'Queued'], failed: ['red', 'Failed'],
    sent: ['blue', 'Sent'], delivered: ['green', 'Delivered'], read: ['green', 'Read'],
    open: ['yellow', 'Open'], resolved: ['green', 'Resolved'], assigned: ['blue', 'Assigned'],
  };
  const [color, label] = map[status] || ['gray', status];
  return <Badge label={label} color={color} />;
}
