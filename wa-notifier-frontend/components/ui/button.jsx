'use client';
import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ' +
  'transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-brand-gradient text-white shadow-glow hover:brightness-[1.07]',
        outline: 'border border-border bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        danger: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-red-600',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export const Button = React.forwardRef(function Button(
  { children, variant = 'primary', size = 'md', className = '', ...props },
  ref
) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
});
