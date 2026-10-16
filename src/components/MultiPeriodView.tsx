import { useState } from 'react';
import { ChevronLeft, ExternalLink, Clock, Zap, Quote } from 'lucide-react';
import type { ChangeBlock, BreakdownRow, Comparison } from '../types';
import { Card, CardHeader, Badge } from './ui/Card';
import { Segmented } from './ui/Controls';
import { Legend } from './charts/ChartBase';
import { DivergingBars, type DivergingDatum } from './charts/DivergingBars';
import { iconFor } from '../lib/icons';
import { sectorColor, directionColor, DIRECTION_COLOR } from '../lib/brand';
import { fmtValue, dateLabel, axisPct, headlineText } from '../lib/format';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Drill-down for a dashboard that carries Weekly/MoM/QoQ `views`. A period toggle
 *  drives a change-by-segment chart, a segment→sub detail list, optional lifted
 *  "why it moved" insights, and a one-line read. Handles % and pp/pts metrics. */
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

  const initial = (views.find((v) => v.comparison === block.comparison && v.available)?.comparison ??
    views.find((v) => v.available)?.comparison ??
    views[0]?.comparison ??
    'MoM') as Comparison;
  const [sel, setSel] = useState<Comparison>(initial);
  const view = views.find((v) => v.comparison === sel) ?? views[0];
  if (!view) return null;

  const dir = directionColor(view.direction);
  const bNoun = block.breakdownNoun ?? 'segment';
  const sNoun = block.subNoun ?? 'group';
  const changeNoun = block.changeNoun ?? 'Change';
  const isPts = view.changeDisplay === 'pts' || view.changeDisplay === 'pp';
  const dispFor = (r: BreakdownRow) => r.changeDisplay ?? view.changeDisplay;
  const magOf = (r: BreakdownRow) => (isPts ? (r.changeAbs ?? null) : (r.changePct ?? null));
  const hasSub = view.breakdown.some((r) => r.sub && r.sub.length);

  const priced = view.breakdown.filter((r) => magOf(r) != null);
  const chartData: DivergingDatum[] = priced.map((r) => ({
    key: r.label,
    label: r.label,
    value: magOf(r) as number,
    color: directionColor(r.direction),
    valueLabel: headlineText(r.changePct, r.changeAbs, dispFor(r)),
    tipTitle: r.label,
    tipColor: directionColor(r.direction),
    tipRows: [
      { label: 'Value', value: `${fmtValue(r.lastValue, block.unit)} → ${fmtValue(r.thisValue, block.unit)}` },
      { label: 'Change', value: headlineText(r.changePct, r.changeAbs, dispFor(r)) },
    ],
  }));
  const axisFmt = isPts ? (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}` : axisPct;

  return (
    <div className="animate-fade-in">
      <button
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <ChevronLeft size={16} /> Back to {backLabel}
      </button>

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
          <Segmented value={sel} onChange={(v) => setSel(v)} options={views.map((v) => ({ value: v.comparison, label: v.label }))} />
          <span className="text-[11.5px] text-slate-400">Weekly / monthly / quarterly</span>
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
              title={`${changeNoun} by ${bNoun}`}
              subtitle={block.breakdownSubtitle ?? `${cap(view.label)}-over-${view.label.toLowerCase()}`}
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
              <DivergingBars data={chartData} axisFormat={axisFmt} labelWidth={190} />
            ) : (
              <div className="py-8 text-center text-[13px] text-slate-400">Nothing comparable in this window.</div>
            )}
          </Card>

          <Card pad={false} className="mb-4">
            <div className="p-4 pb-2">
              <h3 className="font-display text-[15px] font-bold text-slate-900">
                By {bNoun}
                {hasSub ? ` and ${sNoun}` : ''}
              </h3>
              <p className="text-[12px] text-slate-500">
                {hasSub ? `${cap(bNoun)} average, then the move for each ${sNoun}. ` : `Each ${bNoun}'s move. `}⚡ = notable move.
              </p>
            </div>
            <div className="flex flex-col gap-2 px-4 pb-4">
              {view.breakdown.map((r) => (
                <CategoryRow key={r.label} row={r} unit={block.unit} disp={view.changeDisplay} />
              ))}
            </div>
          </Card>
        </>
      )}

      {block.insights && block.insights.length > 0 && (
        <Card className="mb-4" accent={accent}>
          <CardHeader icon={Quote} accent={accent} title="Why it moved" subtitle="Lifted from the source research — latest available" />
          <div className="flex flex-col gap-3">
            {block.insights.map((ins, i) => (
              <div key={i} className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/70">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-display text-[13px] font-bold text-slate-900">{ins.title}</div>
                  {ins.asOf && <div className="tnum shrink-0 text-[10.5px] text-slate-400">as of {dateLabel(ins.asOf)}</div>}
                </div>
                {ins.body && <p className="mt-1 text-[12.5px] leading-snug text-slate-600">{ins.body}</p>}
                {ins.bullets && ins.bullets.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {ins.bullets.map((b, j) => (
                      <li key={j} className="flex gap-1.5 text-[12px] leading-snug text-slate-600">
                        <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: accent }} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>
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

function CategoryRow({ row, unit, disp }: { row: BreakdownRow; unit: string; disp?: 'pct' | 'pp' | 'pts' }) {
  const tracked = row.changePct != null || row.changeAbs != null;
  const dir = directionColor(row.direction);
  const chg = headlineText(row.changePct, row.changeAbs, row.changeDisplay ?? disp);
  return (
    <div className="rounded-xl ring-1 ring-slate-200/70">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className={`font-display text-[13.5px] font-bold ${tracked ? 'text-slate-900' : 'text-slate-400'}`}>{row.label}</div>
          {tracked ? (
            <>
              {(row.lastValue != null || row.thisValue != null) && (
                <div className="tnum text-[11.5px] text-slate-500">
                  {fmtValue(row.lastValue, unit)} <span className="text-slate-300">→</span> {fmtValue(row.thisValue, unit)}
                </div>
              )}
              {row.note && <div className="text-[10.5px] italic text-amber-600">{row.note}</div>}
            </>
          ) : (
            <div className="text-[11.5px] italic text-slate-400">{row.note ?? 'not tracked'}</div>
          )}
        </div>
        {tracked && (
          <div className="tnum shrink-0 font-bold" style={{ color: dir, fontSize: row.bigMove ? 16 : 14 }}>
            {chg}
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
                {headlineText(b.changePct, b.changeAbs, b.changeDisplay ?? disp)}
                {b.bigMove && ' ⚡'}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
