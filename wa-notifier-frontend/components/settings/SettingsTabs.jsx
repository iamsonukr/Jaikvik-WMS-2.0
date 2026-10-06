'use client';
export default function SettingsTabs({ tabs, active, onChange }) {
  return <div role="tablist" aria-label="Settings sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
    {tabs.map(({ id, label }) => <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={active === id} aria-controls={`settings-panel-${id}`} tabIndex={active === id ? 0 : -1}
      onClick={() => onChange(id)} onKeyDown={(event) => {
        const index = tabs.findIndex((tab) => tab.id === id);
        let next;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];
        if (next) { event.preventDefault(); onChange(next.id); document.getElementById(`settings-tab-${next.id}`)?.focus(); }
      }} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${active === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
  </div>;
}
