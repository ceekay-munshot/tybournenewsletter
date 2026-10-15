import { useState } from 'react';
import { ChevronLeft, ExternalLink, Clock, Zap } from 'lucide-react';
import type { ChangeBlock, BreakdownRow, Comparison } from '../types';
import { Card, CardHeader, Badge } from './ui/Card';
import { Segmented } from './ui/Controls';
import { Legend } from './charts/ChartBase';
import { DivergingBars, type DivergingDatum } from './charts/DivergingBars';
import { iconFor } from '../lib/icons';
import { sectorColor, directionColor, DIRECTION_COLOR } from '../lib/brand';
import { signedPct, fmtValue, dateLabel, axisPct, headlineText } from '../lib/format';

/** Drill-down for a dashboard that carries Weekly/MoM/QoQ `views`. One period
 *  toggle drives the whole view; each view shows a price-change-by-segment chart
 *  and a segment→brand detail list. Honest about windows it can't compute yet. */
export function MultiPeriodView({
  block,
  onBack,
  backLabel = 'Overview',
}: {
  block: ChangeBlock;
  onBack: () => void;
  backLabel?: string;
}) {
  const views = block.views ?? [];
  const Icon = iconFor(block.systemId, block.sector);
  const accent = sectorColor(block.sector);

  const initial =
    (views.find((v) => v.comparison === block.comparison && v.available)?.comparison ??
      views.find((v) => v.available)?.comparison ??
      views[0]?.comparison ??
      'MoM') as Comparison;
  const [sel, setSel] = useState<Comparison>(initial);
  const view = views.find((v) => v.comparison === sel) ?? views[0];
  if (!view) return null;

  const dir = directionColor(view.direction);
  const bNoun = block.breakdownNoun ?? 'segment';
  const sNoun = block.subNoun ?? 'group';
  const bNounCap = bNoun.charAt(0).toUpperCase() + bNoun.slice(1);
  const priced = view.breakdown.filter((r) => r.changePct != null);
  const chartData: DivergingDatum[] = priced.map((r) => ({
    key: r.label,
    label: r.label,
    value: r.changePct as number,
    color: directionColor(r.direction),
    valueLabel: signedPct(r.changePct),
    tipTitle: r.label,
    tipColor: directionColor(r.direction),
    tipRows: [
      { label: 'Price', value: `${fmtValue(r.lastValue, block.unit)} → ${fmtValue(r.thisValue, block.unit)}` },
      { label: 'Change', value: signedPct(r.changePct) },
    ],
  }));

  return (
    <div className="animate-fade-in">
      <button
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <ChevronLeft size={16} /> Back to {backLabel}
      </button>

      {/* headline + period toggle */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${accent}14`, color: accent }}>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <h2 className="font-display text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{block.name}</h2>
              <Badge color={accent}>{block.sector}</Badge>
              {view.available && view.bigMove && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-100">
                  <Zap size={11} /> big move
                </span>
              )}
              {block.isStale && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-100">
                  <Clock size={11} /> stale
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] text-slate-500">
              {block.metricLabel}: <span className="font-semibold text-slate-700">{view.lastPeriodLabel}</span>{' '}
              <span className="text-slate-300">→</span>{' '}
              <span className="font-semibold text-slate-700">{view.thisPeriodLabel}</span>
            </p>
          </div>

          <div className="text-right">
            <div className="tnum font-display text-[34px] font-bold leading-none" style={{ color: view.available ? dir : '#94A3B8' }}>
              {view.available ? headlineText(view.changePct, view.changeAbs, view.changeDisplay) : '—'}
            </div>
            {view.available && view.lastValue != null && (
              <div className="tnum mt-1.5 text-[13px] text-slate-500">
                {fmtValue(view.lastValue, block.unit)} <span className="text-slate-300">→</span>{' '}
                <span className="font-semibold text-slate-700">{fmtValue(view.thisValue, block.unit)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Segmented
            value={sel}
            onChange={(v) => setSel(v)}
            options={views.map((v) => ({ value: v.comparison, label: v.label }))}
          />
          <span className="text-[11.5px] text-slate-400">Weekly / monthly / quarterly — like-for-like</span>
        </div>
        {!view.available && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-700 ring-1 ring-amber-100">
            {view.unavailableReason ?? 'Not enough data for this window yet.'}
          </p>
        )}
      </Card>

      {view.available && (
        <>
          <Card className="mb-4">
            <CardHeader
              icon={Icon}
              accent={accent}
              title={`Price change by ${bNoun}`}
              subtitle={`${view.label}-over-${view.label.toLowerCase()}, like-for-like`}
              right={
                <Legend
                  items={[
                    { label: 'Up', color: DIRECTION_COLOR.up },
                    { label: 'Down', color: DIRECTION_COLOR.down },
                    { label: 'Flat', color: DIRECTION_COLOR.flat },
                  ]}
                />
              }
            />
            {chartData.length ? (
              <DivergingBars data={chartData} axisFormat={axisPct} labelWidth={180} />
            ) : (
              <div className="py-8 text-center text-[13px] text-slate-400">No priced categories in this window.</div>
            )}
          </Card>

          <Card pad={false} className="mb-4">
            <div className="p-4 pb-2">
              <h3 className="font-display text-[15px] font-bold text-slate-900">
                By {bNoun} and {sNoun}
              </h3>
              <p className="text-[12px] text-slate-500">
                {bNounCap} average, then the move for each {sNoun}. ⚡ = move over 2%.
              </p>
            </div>
            <div className="flex flex-col gap-2 px-4 pb-4">
              {view.breakdown.map((r) => (
                <CategoryRow key={r.label} row={r} unit={block.unit} />
              ))}
            </div>
          </Card>
        </>
      )}

      {view.summary && (
        <Card className="mb-4" accent={accent}>
          <p className="text-[13.5px] leading-relaxed text-slate-700">{view.summary}</p>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-[12px] text-slate-500">
        <div className="min-w-0">
          {block.notes && <p className="mb-1 italic leading-snug text-slate-500">{block.notes}</p>}
          <p>
            Source: <span className="font-medium text-slate-700">{block.sourceName}</span> · as of{' '}
            <span className="tnum">{dateLabel(block.asOf)}</span>
          </p>
        </div>
        {block.dashboardUrl && (
          <a
            href={block.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-slate-700"
          >
            Open full dashboard <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ row, unit }: { row: BreakdownRow; unit: string }) {
  const tracked = row.changePct != null;
  const dir = directionColor(row.direction);
  return (
    <div className="rounded-xl ring-1 ring-slate-200/70">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className={`font-display text-[13.5px] font-bold ${tracked ? 'text-slate-900' : 'text-slate-400'}`}>{row.label}</div>
          {tracked ? (
            <>
              <div className="tnum text-[11.5px] text-slate-500">
                {fmtValue(row.lastValue, unit)} <span className="text-slate-300">→</span> {fmtValue(row.thisValue, unit)}
              </div>
              {row.note && <div className="text-[10.5px] italic text-amber-600">{row.note}</div>}
            </>
          ) : (
            <div className="text-[11.5px] italic text-slate-400">{row.note ?? 'not tracked'}</div>
          )}
        </div>
        {tracked && (
          <div className="tnum shrink-0 font-bold" style={{ color: dir, fontSize: row.bigMove ? 16 : 14 }}>
            {signedPct(row.changePct)}
            {row.bigMove && ' ⚡'}
          </div>
        )}
      </div>
      {row.sub && row.sub.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-slate-200 px-3 py-2">
          {row.sub.map((b) => (
            <span key={b.label} className="inline-flex items-baseline gap-1.5 text-[12px]">
              <span className="text-slate-500">{b.label}</span>
              <span className="tnum font-semibold" style={{ color: directionColor(b.direction) }}>
                {signedPct(b.changePct)}
                {b.bigMove && ' ⚡'}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
