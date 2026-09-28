import { ArrowLeft, ArrowRight } from 'iconsax-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ELLIPSIS = 'ellipsis';

/**
 * Builds the page button list, collapsing long runs into an ellipsis so the
 * control never grows wide enough to push a table sideways on a small screen.
 */
function buildPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, ELLIPSIS, total];
  if (current >= total - 3) return [1, ELLIPSIS, total - 4, total - 3, total - 2, total - 1, total];
  return [1, ELLIPSIS, current - 1, current, current + 1, ELLIPSIS, total];
}

/**
 * Table footer with a rows-per-page selector and page navigation.
 *
 * Render this *outside* `TableContainer` but inside the bordered wrapper, so it
 * stays pinned while the table scrolls sideways underneath it.
 */
function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  itemNoun = 'leads',
  className,
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const noun = total === 1 ? itemNoun.replace(/s$/, '') : itemNoun;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <p className="nums">
        {total === 0 ? `No ${itemNoun}` : `Showing ${from}-${to} of ${total} ${noun}`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows</span>
            <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger className="h-7 w-[4.5rem] text-xs" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)} className="text-xs">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(current - 1)}
            disabled={current <= 1 || total === 0}
            aria-label="Previous page"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>

          <div className="hidden items-center gap-1 sm:flex">
            {buildPages(current, totalPages).map((item, index) =>
              item === ELLIPSIS ? (
                <span key={`gap-${index}`} className="nums w-7 text-center" aria-hidden="true">
                  &hellip;
                </span>
              ) : (
                <Button
                  key={item}
                  variant={item === current ? 'default' : 'outline'}
                  size="icon-sm"
                  className="nums"
                  onClick={() => onPageChange(item)}
                  aria-label={`Page ${item}`}
                  aria-current={item === current ? 'page' : undefined}
                >
                  {item}
                </Button>
              ),
            )}
          </div>

          <span className="nums px-1 sm:hidden">
            {current} / {totalPages}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(current + 1)}
            disabled={current >= totalPages || total === 0}
            aria-label="Next page"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export { Pagination };
