import { Quote } from 'lucide-react';
import type { ChangeBlock } from '../types';
import { Card, CardHeader } from './ui/Card';

/** Narrative blocks (podcast): the quarter-over-quarter recurring-theme comparison —
 *  last quarter's themes beside this quarter's, with "new" tags on fresh threads. */
export function QuarterThemes({ block, accent }: { block: ChangeBlock; accent: string }) {
  if (!block.highlights?.length) return null;
  const hasPrev = !!block.prevHighlights?.length;
  return (
    <Card className="mb-4" accent={accent}>
      <CardHeader
        icon={Quote}
        accent={accent}
        title="Recurring themes — last quarter vs this quarter"
        subtitle={hasPrev ? `What the investor podcasts covered: ${block.lastPeriodLabel} → ${block.thisPeriodLabel}` : block.tone}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {hasPrev && (
          <ThemeColumn
            label={block.lastPeriodLabel}
            count={block.lastValue}
            tone={block.prevTone}
            themes={block.prevHighlights!}
            tint="#64748B"
          />
        )}
        <ThemeColumn
          label={block.thisPeriodLabel}
          count={block.thisValue}
          tone={block.thisTone ?? block.tone}
          themes={block.highlights}
          newThemes={block.newHighlights}
          tint={accent}
          highlight
        />
      </div>
      {hasPrev && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="inline-block rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-100">
            new
          </span>
          = theme that appears this quarter but not last quarter · top recurring threads shown per quarter
        </p>
      )}
    </Card>
  );
}

/** One quarter's column in the podcast last-vs-this theme comparison. */
function ThemeColumn({
  label,
  count,
  tone,
  themes,
  newThemes,
  tint,
  highlight = false,
}: {
  label: string;
  count: number | null;
  tone?: string;
  themes: string[];
  newThemes?: string[];
  tint: string;
  highlight?: boolean;
}) {
  const newSet = new Set((newThemes ?? []).map((t) => t.toLowerCase()));
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: highlight ? `${tint}40` : '#E2E8F0', background: highlight ? `${tint}0A` : 'rgba(248,250,252,0.5)' }}
    >
      <div
        className="mb-2 flex items-baseline justify-between gap-2 border-b pb-1.5"
        style={{ borderColor: highlight ? `${tint}30` : '#E2E8F0' }}
      >
        <span className="font-display text-[13px] font-bold text-slate-900">{label}</span>
        <span className="tnum text-[11px] text-slate-500">
          {count != null ? `${count} episode${count === 1 ? '' : 's'}` : '—'}
          {tone ? ` · ${tone}` : ''}
        </span>
      </div>
      {themes.length ? (
        <ul className="flex flex-col gap-1.5">
          {themes.map((h, i) => {
            const isNew = newSet.has(h.toLowerCase());
            return (
              <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug text-slate-700">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: tint }} />
                <span>
                  {h}
                  {isNew && (
                    <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-100">
                      new
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12px] italic text-slate-400">No themes captured this quarter.</p>
      )}
    </div>
  );
}
