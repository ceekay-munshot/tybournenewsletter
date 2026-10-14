import type { LucideIcon } from 'lucide-react';

export interface TabDef<T extends string = string> {
  key: T;
  label: string;
  icon?: LucideIcon;
  color?: string;
  badge?: string;
}

/** Primary navigation tabs (icon + label), active tab coloured by its accent. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="scroll-thin -mb-px flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.key === active;
        const Icon = t.icon;
        const color = t.color ?? '#6366F1';
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className="group relative flex shrink-0 items-center gap-2 rounded-t-xl px-3.5 py-2.5 text-[13px] font-semibold transition"
            style={{ color: isActive ? color : '#64748B' }}
          >
            {Icon && <Icon size={16} strokeWidth={2.3} className={isActive ? '' : 'opacity-70'} />}
            <span className="whitespace-nowrap">{t.label}</span>
            {t.badge && (
              <span
                className="tnum rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: `${color}1A`, color }}
              >
                {t.badge}
              </span>
            )}
            <span
              className="absolute inset-x-2 bottom-0 h-[3px] rounded-full transition-all"
              style={{ background: isActive ? color : 'transparent' }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Lightweight sub-tabs / chips. */
export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; color?: string }[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
              isActive ? 'border-transparent text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
            style={isActive ? { background: t.color ?? '#6366F1' } : undefined}
          >
            {t.color && (
              <span className="h-2 w-2 rounded-sm" style={{ background: isActive ? '#ffffff' : t.color }} />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
