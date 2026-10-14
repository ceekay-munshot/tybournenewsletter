import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { withAlpha } from '../../lib/brand';

/** Rounded-2xl card: soft shadow + hairline ring. With `accent`, gets a subtle
 *  sector-colour gradient tint and a 3px left accent bar (inset, follows corners). */
export function Card({
  children,
  className = '',
  pad = true,
  hover = false,
  accent,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  hover?: boolean;
  accent?: string;
}) {
  const padC = pad ? 'p-4 sm:p-5' : '';
  if (accent) {
    return (
      <section
        className={`min-w-0 rounded-2xl ring-1 ring-slate-200/70 ${padC} ${
          hover ? 'transition-all duration-300 hover:-translate-y-1 hover:ring-slate-300' : ''
        } ${className}`}
        style={{
          background: `linear-gradient(140deg, #ffffff 0%, ${withAlpha(accent, 0.055)} 100%)`,
          boxShadow: `inset 3px 0 0 0 ${accent}, 0 1px 2px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.07)`,
        }}
      >
        {children}
      </section>
    );
  }
  return (
    <section
      className={`min-w-0 rounded-2xl bg-white shadow-card ring-1 ring-slate-200/70 ${padC} ${
        hover ? 'transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover hover:ring-slate-300/70' : ''
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  right,
  accent = '#6366F1',
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ background: `${accent}14`, color: accent }}
          >
            <Icon size={17} strokeWidth={2.2} />
          </span>
        )}
        <div>
          <h3 className="font-display text-[15px] font-bold leading-tight text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** Tab-level page opener: title + subtitle left, optional controls right. */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 max-w-3xl text-[13px] leading-snug text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">{right}</div>}
    </div>
  );
}

export function Badge({
  children,
  color = '#64748B',
  soft = true,
  className = '',
}: {
  children: ReactNode;
  color?: string;
  soft?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${className}`}
      style={soft ? { background: `${color}1A`, color } : { background: color, color: '#fff' }}
    >
      {children}
    </span>
  );
}

export function Pill({
  children,
  className = '',
  color = '#334155',
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${className}`}
      style={{ borderColor: `${color}30`, color }}
    >
      {children}
    </span>
  );
}
