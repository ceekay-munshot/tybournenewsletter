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
  onBack?: () => void;
  backLabel?: string;
}) {
  const views = block.views ?? [];
  // Only offer periods that actually exist for this system — an unavailable window
  // (e.g. no weekly series) is never shown as a dead toggle option.
  const availViews = views.filter((v) => v.available);
  const Icon = iconFor(block.systemId, block.sector);
  const accent = sectorColor(block.sector);

  const initial = (availViews.find((v) => v.comparison === block.comparison)?.comparison ??
    availViews[0]?.comparison ??
    'MoM') as Comparison;
  const [sel, setSel] = useState<Comparison>(initial);
  const view = availViews.find((v) => v.comparison === sel) ?? availViews[0] ?? views[0];
  if (!view) return null;

  const dir = directionColor(view.direction);
  const bNoun = block.breakdownNoun ?? 'segment';
  const sNoun = block.subNoun ?? 'group';
  const changeNoun = block.changeNoun ?? 'Change';
  const isPts = view.changeDisplay === 'pts' || view.changeDisplay === 'pp';
  const dispFor = (r: BreakdownRow) => r.changeDisplay ?? view.changeDisplay;
  const magOf = (r: BreakdownRow) => (isPts ? (r.changeAbs ?? null) : (r.changePct ?? null));
  const hasSub = view.breakdown.some((r) => r.sub && r.sub.length);
  // Show the value columns only when some row (or its sub-rows) carries comparable
  // values — a pp-only breakdown (e.g. 13F) then renders a clean two-column table.
  const hasVals = view.breakdown.some(
    (r) => r.lastValue != null || r.thisValue != null || (r.sub ?? []).some((s) => s.lastValue != null || s.thisValue != null)
  );
  // The prior comparison (one step further back) — shown as an extra value + change
  // column so the table reads as two consecutive periods of trend. Adaptive: only
  // appears when the connector supplies it.
  const subsOf = (r: BreakdownRow) => r.sub ?? [];
  const showPrevVal =
    hasVals &&
    (view.prevValue != null || view.breakdown.some((r) => r.prevValue != null || subsOf(r).some((s) => s.prevValue != null)));
  const showPrevChg =
    view.prevChangePct != null ||
    view.prevChangeAbs != null ||
    view.breakdown.some(
      (r) =>
        r.prevChangePct != null ||
        r.prevChangeAbs != null ||
        subsOf(r).some((s) => s.prevChangePct != null || s.prevChangeAbs != null)
    );
  const prevArrow = view.prevLabel ? `${view.prevLabel} → ${view.lastPeriodLabel}` : 'Prior';
  const thisArrow = `${view.lastPeriodLabel} → ${view.thisPeriodLabel}`;

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
      {onBack && (
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-500 transition hover:text-slate-800"
        >
          <ChevronLeft size={16} /> Back to {backLabel}
        </button>
      )}

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
                {view.prevValue != null && (
                  <>
                    {fmtValue(view.prevValue, block.unit)} <span className="text-slate-300">→</span>{' '}
                  </>
                )}
                {fmtValue(view.lastValue, block.unit)} <span className="text-slate-300">→</span>{' '}
                <span className="font-semibold text-slate-700">{fmtValue(view.thisValue, block.unit)}</span>
              </div>
            )}
            {view.available && (view.prevChangePct != null || view.prevChangeAbs != null) && (
              <div className="tnum mt-1 text-[11.5px] text-slate-400">
                prior {prevArrow}:{' '}
                <span className="font-semibold" style={{ color: directionColor(view.prevDirection ?? 'flat') }}>
                  {headlineText(view.prevChangePct, view.prevChangeAbs, view.changeDisplay)}
                </span>
              </div>
            )}
          </div>
        </div>

        {availViews.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Segmented
              value={sel}
              onChange={(v) => setSel(v)}
              options={availViews.map((v) => ({ value: v.comparison, label: v.label }))}
            />
            <span className="text-[11.5px] text-slate-400">{availViews.map((v) => v.label.toLowerCase()).join(' / ')}</span>
          </div>
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
                {hasSub ? `${cap(bNoun)}, then the move for each ${sNoun}. ` : `Each ${bNoun}'s move. `}⚡ = notable move.
              </p>
            </div>
            <div className="px-4 pb-4">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="border-r border-slate-200 px-3 py-2.5 capitalize last:border-r-0">{bNoun}</th>
                    {showPrevVal && <th className="whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-right font-medium text-slate-400 last:border-r-0">{view.prevLabel}</th>}
                    {hasVals && <th className="whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-right last:border-r-0">{view.lastPeriodLabel}</th>}
                    {hasVals && <th className="whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-right last:border-r-0">{view.thisPeriodLabel}</th>}
                    {showPrevChg && <th className="whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-right font-medium text-slate-400 last:border-r-0">{prevArrow}</th>}
                    <th className="whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-right last:border-r-0">{showPrevChg ? thisArrow : changeNoun}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.breakdown.map((r) => (
                    <BreakdownRows
                      key={r.label}
                      row={r}
                      unit={block.unit}
                      disp={view.changeDisplay}
                      hasVals={hasVals}
                      showPrevVal={showPrevVal}
                      showPrevChg={showPrevChg}
                    />
                  ))}
                </tbody>
              </table>
              </div>
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

/** One breakdown item as a table row, with any sub-dimension items as indented sub-rows.
 *  Columns: name · [prior value · last value · this value] · [prior change · this change]. */
function BreakdownRows({
  row,
  unit,
  disp,
  hasVals,
  showPrevVal,
  showPrevChg,
}: {
  row: BreakdownRow;
  unit: string;
  disp?: 'pct' | 'pp' | 'pts';
  hasVals: boolean;
  showPrevVal: boolean;
  showPrevChg: boolean;
}) {
  const prevChg = (r: BreakdownRow) => headlineText(r.prevChangePct, r.prevChangeAbs, r.changeDisplay ?? disp);
  const prevTracked = (r: BreakdownRow) => r.prevChangePct != null || r.prevChangeAbs != null;
  return (
    <>
      {rowCells(row, false)}
      {(row.sub ?? []).map((s) => rowCells(s, true))}
    </>
  );

  function rowCells(r: BreakdownRow, isSub: boolean) {
    const tracked = r.changePct != null || r.changeAbs != null;
    const chg = headlineText(r.changePct, r.changeAbs, r.changeDisplay ?? disp);
    const vpad = isSub ? 'py-1.5' : 'py-2.5';
    const valCls = isSub ? 'text-slate-400' : 'text-slate-500';
    const thisValCls = isSub ? 'text-slate-600' : 'font-semibold text-slate-800';
    return (
      <tr key={r.label} className={`border-b border-slate-100 ${isSub ? 'bg-slate-50/50' : ''}`}>
        <td className={`border-r border-slate-100 ${isSub ? 'pl-5' : 'pl-3'} pr-3 ${vpad} align-top last:border-r-0 ${isSub ? 'text-slate-500' : ''}`}>
          {isSub && <span className="mr-1 text-slate-300">└</span>}
          <span className={isSub ? '' : `font-display text-[13px] font-bold ${tracked ? 'text-slate-900' : 'text-slate-400'}`}>{r.label}</span>
          {r.note && <span className="ml-1.5 text-[10px] italic text-amber-600">{r.note}</span>}
          {!isSub && !tracked && !r.note && <span className="ml-1.5 text-[11px] italic text-slate-400">not tracked</span>}
        </td>
        {showPrevVal && (
          <td className={`tnum whitespace-nowrap border-r border-slate-100 px-3 ${vpad} text-right align-top text-slate-400 last:border-r-0`}>
            {r.prevValue != null ? fmtValue(r.prevValue, unit) : ''}
          </td>
        )}
        {hasVals && (
          <td className={`tnum whitespace-nowrap border-r border-slate-100 px-3 ${vpad} text-right align-top last:border-r-0 ${valCls}`}>
            {r.lastValue != null ? fmtValue(r.lastValue, unit) : ''}
          </td>
        )}
        {hasVals && (
          <td className={`tnum whitespace-nowrap border-r border-slate-100 px-3 ${vpad} text-right align-top last:border-r-0 ${thisValCls}`}>
            {r.thisValue != null ? fmtValue(r.thisValue, unit) : ''}
          </td>
        )}
        {showPrevChg && (
          <td
            className={`tnum whitespace-nowrap border-r border-slate-100 px-3 ${vpad} text-right align-top last:border-r-0`}
            style={{ color: prevTracked(r) ? directionColor(r.prevDirection ?? 'flat') : '#CBD5E1' }}
          >
            {prevTracked(r) ? prevChg(r) : ''}
          </td>
        )}
        <td
          className={`tnum whitespace-nowrap border-r border-slate-100 px-3 ${vpad} text-right align-top last:border-r-0 ${isSub ? 'font-semibold' : 'font-bold'}`}
          style={{ color: tracked ? directionColor(r.direction) : '#94A3B8', fontSize: !isSub && r.bigMove ? 14.5 : 13 }}
        >
          {tracked ? chg : isSub ? '' : '—'}
          {r.bigMove && ' ⚡'}
        </td>
      </tr>
    );
  }
}
