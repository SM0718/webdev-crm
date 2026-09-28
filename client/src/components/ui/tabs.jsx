import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

const Tabs = ({ className, ...props }) => (
  <TabsPrimitive.Root className={cn('min-w-0', className)} {...props} />
);
Tabs.displayName = TabsPrimitive.Root.displayName;

/**
 * A segmented control that grows with its options. `min-h-9` rather than `h-9`
 * and `flex-wrap` so a long row of pills wraps onto a second line on a narrow
 * screen instead of forcing the page to scroll sideways; `justify-start` keeps
 * wrapped lines left aligned (centering a scrollable row can push its leading
 * items out of reach).
 */
const TabsList = ({ className, ...props }) => (
  <TabsPrimitive.List
    className={cn(
      'inline-flex min-h-9 max-w-full flex-wrap items-center justify-start rounded-lg bg-muted p-1 text-muted-foreground',
      className,
    )}
    {...props}
  />
);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = ({ className, ...props }) => (
  <TabsPrimitive.Trigger
    className={cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
);
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = ({ className, ...props }) => (
  <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
);
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
