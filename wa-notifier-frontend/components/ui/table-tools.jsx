'use client';
import * as React from 'react';
import { ArrowDownAZ, ArrowUpAZ, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const normalizeSortValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const date = Date.parse(value);
  if (typeof value === 'string' && value.match(/\d{4}-\d{2}-\d{2}/) && !Number.isNaN(date)) return date;
  return String(value).toLowerCase();
};

export function sortItems(items, sort, accessors) {
  const accessor = accessors?.[sort?.key];
  if (!accessor) return items;

  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const aValue = normalizeSortValue(accessor(a));
    const bValue = normalizeSortValue(accessor(b));

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * direction;
    }
    return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' }) * direction;
  });
}

export function nextSort(currentSort, key) {
  if (currentSort?.key !== key) return { key, direction: 'asc' };
  return { key, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' };
}

export function SortableTh({ label, sortKey, sort, onSort, align = 'left', className = '' }) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUpAZ : ArrowDownAZ;

  return (
    <th className={cn('px-4 py-3 font-semibold', align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, sortKey))}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground',
          align === 'right' && 'justify-end',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {label}
        <Icon size={13} />
      </button>
    </th>
  );
}

export function usePagination(items, { initialPageSize = 10, resetKey = '' } = {}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  React.useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  React.useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  const pageItems = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const startItem = totalItems === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const endItem = Math.min(totalItems, page * pageSize);

  return { pageItems, page, pageSize, setPage, setPageSize, totalItems, totalPages, startItem, endItem };
}

export function PaginationControls({
  page,
  totalPages,
  pageSize,
  totalItems,
  startItem,
  endItem,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}) {
  if (totalItems <= 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{startItem}-{endItem} of {totalItems}</span>
        <select
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / page</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          Previous
        </button>
        <span className="inline-flex h-8 items-center px-2 text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
