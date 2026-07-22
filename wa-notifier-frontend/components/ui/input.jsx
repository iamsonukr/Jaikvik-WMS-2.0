'use client';
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef(function Input(
  { label, error, className = '', ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-all duration-150',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error && 'border-destructive focus:ring-destructive',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
});

export const Select = React.forwardRef(function Select(
  { label, error, children, className = '', ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground shadow-sm transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
});

export const Textarea = React.forwardRef(function Textarea(
  { label, error, className = '', ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <textarea
        ref={ref}
        className={cn(
          'min-h-[90px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-all duration-150',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring',
          'disabled:cursor-not-allowed disabled:opacity-60',
          error && 'border-destructive focus:ring-destructive',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
});
