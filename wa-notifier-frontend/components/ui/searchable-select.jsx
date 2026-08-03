'use client';
import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const variants = {
  default: {
    trigger: 'h-10 rounded-lg border border-input bg-background px-3 text-foreground shadow-sm hover:bg-accent',
    menu: 'border border-border bg-popover text-popover-foreground shadow-xl',
    searchWrap: 'border-b border-border p-2',
    input: 'border border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring',
    option: 'text-foreground hover:bg-accent',
    selected: 'bg-accent text-accent-foreground',
    muted: 'text-muted-foreground',
  },
  sidebar: {
    trigger: 'rounded-lg border border-white/5 bg-white/[0.04] px-3 py-2 text-white hover:bg-white/10',
    menu: 'border border-white/10 bg-[#0b1524] text-slate-300 shadow-2xl',
    searchWrap: 'border-b border-white/10 p-2',
    input: 'border border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 focus:ring-brand',
    option: 'text-slate-300 hover:bg-white/10',
    selected: 'bg-brand-gradient text-white',
    muted: 'text-slate-500',
  },
};

export function SearchableSelect({
  value,
  options = [],
  onChange,
  placeholder = 'Select option',
  searchPlaceholder = 'Search...',
  emptyText = 'No options found',
  variant = 'default',
  className = '',
  menuClassName = '',
  renderValue,
  renderOption,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const ref = React.useRef(null);
  const styles = variants[variant] || variants.default;
  const selected = options.find((option) => option.value === value);

  React.useEffect(() => {
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const filteredOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => (
      `${option.label || ''} ${option.description || ''} ${option.searchText || ''}`
        .toLowerCase()
        .includes(q)
    ));
  }, [options, query]);

  const choose = (option) => {
    onChange?.(option.value, option);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn('flex w-full items-center justify-between gap-2 text-left text-sm transition-colors', styles.trigger)}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
        </span>
        <ChevronDown size={14} className={cn('shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn('absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg animate-fade-in', styles.menu, menuClassName)}>
          <div className={styles.searchWrap}>
            <div className="relative">
              <Search size={14} className={cn('absolute left-2.5 top-1/2 -translate-y-1/2', styles.muted)} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className={cn('h-9 w-full rounded-md px-8 text-sm outline-none transition-shadow focus:ring-2', styles.input)}
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {!filteredOptions.length && (
              <div className={cn('px-3 py-6 text-center text-sm', styles.muted)}>{emptyText}</div>
            )}
            {filteredOptions.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => choose(option)}
                  className={cn('flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors', styles.option, active && styles.selected)}
                >
                  <span className="min-w-0">
                    {renderOption ? renderOption(option) : (
                      <>
                        <span className="block truncate font-medium">{option.label}</span>
                        {option.description && <span className={cn('block truncate text-xs', active ? 'text-white/75' : styles.muted)}>{option.description}</span>}
                      </>
                    )}
                  </span>
                  {active && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
