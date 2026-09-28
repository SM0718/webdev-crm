import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const VARIANT_CLASSES = {
  default: 'border-transparent bg-primary/12 text-primary',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  destructive: 'border-transparent bg-destructive/12 text-destructive',
  success: 'border-transparent bg-success/14 text-success',
  warning: 'border-transparent bg-warning/16 text-warning',
  muted: 'border-transparent bg-muted text-muted-foreground',
  outline: 'border-border text-foreground',
  info: 'border-transparent bg-sky-500/12 text-sky-600 dark:text-sky-400',
  violet: 'border-transparent bg-violet-500/12 text-violet-600 dark:text-violet-400',
};

const Badge = forwardRef(({ className, variant = 'default', ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors',
      VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default,
      className,
    )}
    {...props}
  />
));
Badge.displayName = 'Badge';

export { Badge };
