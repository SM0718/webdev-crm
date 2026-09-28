import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Progress = forwardRef(({ className, value, indicatorClassName, ...props }, ref) => (
  <div
    ref={ref}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value ?? 0)}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    {...props}
  >
    <div
      className={cn('h-full w-full flex-1 bg-primary transition-transform duration-500 ease-out', indicatorClassName)}
      style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value ?? 0))}%)` }}
    />
  </div>
));
Progress.displayName = 'Progress';

export { Progress };
