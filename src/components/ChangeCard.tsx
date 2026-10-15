import { ArrowUpRight, ArrowDownRight, ArrowRight, AlertTriangle, Clock, Quote } from 'lucide-react';
import type { ChangeBlock } from '../types';
import { Card } from './ui/Card';
import { Sparkline } from './charts/Sparkline';
import { directionColor, sectorColor, withAlpha } from '../lib/brand';
import { iconFor } from '../lib/icons';
import { headlineText, fmtValue, dateLabel } from '../lib/format';

const DirArrow = ({ dir, color, size = 22 }: { dir: string; color: string; size?: number }) => {
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : ArrowRight;
  return <Icon size={size} strokeWidth={2.6} style={{ color }} />;
};

export function ChangeCard({ block, onSelect }: { block: ChangeBlock; onSelect: (id: string) => void }) {
  const Icon = iconFor(block.systemId, block.sector);
  const accent = sectorColor(block.sector);
  const dir = directionColor(block.direction);

  if (block.status === 'error') {
    return (
      <Card className="flex flex-col" hover accent={accent}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${accent}14`, color: accent }}>
            <Icon size={16} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 font-display text-[14px] font-bold leading-tight text-slate-900">{block.name}</div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] text-rose-600 ring-1 ring-rose-100">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="leading-snug">No data — {block.statusReason ?? 'source unavailable'}.</span>
        </div>
      </Card>
    );
  }

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${accent}14`, color: accent }}>
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <div className="font-display text-[14px] font-bold leading-tight text-slate-900">{block.name}</div>
      </div>
      {block.isStale && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-100">
          <Clock size={10} /> stale
        </span>
      )}
    </div>
  );

  // Narrative (themes) card — no big % number.
  if (block.highlights && block.highlights.length) {
    return (
      <button onClick={() => onSelect(block.systemId)} className="group block w-full text-left">
        <Card className="flex h-full flex-col" hover accent={accent}>
          {header}
          <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: accent }}>
            <Quote size={13} /> {block.metricLabel} · {block.thisPeriodLabel}
          </div>
          <ul className="mt-2 space-y-1">
            {block.highlights.slice(0, 4).map((h, i) => (
              <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-slate-600">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                <span className="line-clamp-2">{h}</span>
              </li>
            ))}
          </ul>
          {block.tone && <div className="mt-2 text-[11px] italic text-slate-500">{block.tone}</div>}
          <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[10.5px] text-slate-400">
            <span className="truncate">as of {dateLabel(block.asOf)}</span>
            <span className="truncate" style={{ color: withAlpha(accent, 0.95) }}>{block.sourceName}</span>
          </div>
        </Card>
      </button>
    );
  }

  return (
    <button onClick={() => onSelect(block.systemId)} className="group block w-full text-left">
      <Card className="flex h-full flex-col" hover accent={accent}>
        {header}

        <div className="mt-3 flex items-end gap-1.5">
          <DirArrow dir={block.direction} color={dir} />
          <span className="tnum font-display text-[28px] font-bold leading-none" style={{ color: dir }}>
            {headlineText(block.changePct, block.changeAbs, block.changeDisplay)}
          </span>
        </div>
        <div className="mt-1.5 text-[12px] font-medium text-slate-500">
          {block.lastPeriodLabel} <span className="text-slate-300">→</span> {block.thisPeriodLabel}
        </div>

        {block.trend && block.trend.length > 1 && (
          <div className="mt-2 -mx-1">
            <Sparkline
              points={block.trend.map((t) => ({ label: t.period, value: t.value }))}
              color={accent}
              height={38}
              format={(n) => fmtValue(n, block.unit)}
            />
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[10.5px] text-slate-400">
          <span className="truncate">as of {dateLabel(block.asOf)}</span>
          <span className="truncate" style={{ color: withAlpha(accent, 0.95) }}>
            {block.sourceName}
          </span>
        </div>
      </Card>
    </button>
  );
}
