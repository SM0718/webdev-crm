import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Every table in the app is wrapped in one of these so the table scrolls itself
 * instead of widening the page. Three details matter:
 *
 *  - `overflow-x-auto` is what produces the scrollbar.
 *  - `min-w-0` lets this box shrink below its content width. Without it, a
 *    `TableContainer` sitting inside a flex or grid parent inherits the
 *    automatic minimum size, grows to the full table width, and the page ends up
 *    scrolling horizontally with blank space beside it.
 *  - `relative` makes this box the containing block for absolutely positioned
 *    descendants. Sortable headers hide their label in a `sr-only` span, which
 *    is `position: absolute`; with no positioned ancestor it resolved against
 *    the viewport, so a span in the last column sat outside this box, escaped
 *    the clip, and dragged the whole document sideways. Being the containing
 *    block keeps it inside, scrolling with its column like everything else.
 */
const TableContainer = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('relative w-full min-w-0 overflow-x-auto', className)}
    {...props}
  />
));
TableContainer.displayName = 'TableContainer';

const Table = forwardRef(({ className, ...props }, ref) => (
  <table ref={ref} className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
));
Table.displayName = 'Table';

const TableHeader = forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('bg-muted/60 [&_tr]:border-b', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableFooter = forwardRef(({ className, ...props }, ref) => (
  <tfoot ref={ref} className={cn('border-t bg-muted/50 font-medium', className)} {...props} />
));
TableFooter.displayName = 'TableFooter';

const TableRow = forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn('border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted', className)}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = forwardRef(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-3 py-2.5 align-middle', className)} {...props} />
));
TableCell.displayName = 'TableCell';

const TableCaption = forwardRef(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn('mt-4 text-xs text-muted-foreground', className)} {...props} />
));
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableContainer,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
