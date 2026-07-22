'use client';
import { cn } from '@/lib/utils';

const badgeColors = {
  green: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  red: 'border-red-500/25 bg-red-500/12 text-red-700 dark:text-red-300',
  yellow: 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  blue: 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300',
  gray: 'border-border bg-muted text-muted-foreground',
};

export function Badge({ label, color = 'gray', className = '' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5',
        badgeColors[color] || badgeColors.gray,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
