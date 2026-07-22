'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef(function Card({ children, className = '', ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'app-panel rounded-xl transition-shadow duration-200 hover:shadow-card',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-border px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardContent({ children, className = '' }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
