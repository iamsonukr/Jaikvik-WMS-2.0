'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=open]:animate-overlay-show',
        className
      )}
      {...props}
    />
  );
});

export const DialogContent = React.forwardRef(function DialogContent(
  { className, children, showClose = true, ...props },
  ref
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col',
          'rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl',
          'data-[state=open]:animate-content-show focus:outline-none',
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close"
          >
            <X size={16} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ className, ...props }) {
  return <div className={cn('flex items-center justify-between gap-4 border-b border-border px-6 py-4', className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef(function DialogTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn('font-semibold tracking-tight', className)} {...props} />;
});

export const DialogDescription = React.forwardRef(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
});
