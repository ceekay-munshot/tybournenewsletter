import { useState } from 'react';
import { ChevronLeft, AlertTriangle, Clock } from 'lucide-react';
import type { ChangeBlock } from '../types';
import { Card, CardHeader, Badge } from '../components/ui/Card';
import { Segmented } from '../components/ui/Controls';
import { Legend } from '../components/charts/ChartBase';
import { DivergingBars, type DivergingDatum } from '../components/charts/DivergingBars';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { LineArea } from '../components/charts/LineArea';
import { Table, type Column } from '../components/ui/Table';
import { iconFor } from '../lib/icons';
import { sectorColor, directionColor, seriesColor, DIRECTION_COLOR } from '../lib/brand';
import { signedPct, fmtValue, signedValue, fmtCompact, dateLabel, axisPct, headlineText } from '../lib/format';
import { Quote } from 'lucide-react';
import type { BreakdownRow } from '../types';

type Mode = 'pct' | 'abs';

export function SystemView({
  block,
  onBack,
  backLabel = 'Overview',
}: {
  block: ChangeBlock;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [mode, setMode] = useState<Mode>(() => (block.breakdown.some((r) => r.changePct != null) ? 'pct' : 'abs'));
  const Icon = iconFor(block.systemId, block.sector);
  const accent = sectorColor(block.sector);
  const dir = directionColor(block.direction);

  const BackBar = onBack ? (
    <button
      onClick={onBack}
      className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-500 transition hover:text-slate-800"
    >
      <ChevronLeft size={16} /> Back to {backLabel}
    </button>
  ) : null;

  if (block.status === 'error') {
    return (
      <div className="animate-fade-in">
        {BackBar}
        <Card>
          <CardHeader icon={Icon} title={block.name} accent={accent} subtitle={block.metricLabel} />
          <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700 ring-1 ring-rose-100">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">No data available for this period.</p>
              <p className="mt-0.5 text-rose-600">{block.statusReason ?? 'The source could not be reached.'}</p>
              <p className="mt-1 text-[12px] text-rose-500/80">
                We never estimate or fill gaps — this panel will populate on the next successful refresh.
              </p>
            </div>
          </div>
          <SourceLine block={block} />
        </Card>
      </div>
    );
  }

  // ---- breakdown datasets ----
  const pctData: DivergingDatum[] = block.breakdown
    .filter((r) => r.changePct != null)
    .map((r) => ({
      key: r.label,
      label: r.label,
      value: r.changePct as number,
      color: directionColor(r.direction),
      valueLabel: signedPct(r.changePct),
      tipTitle: r.label,
      tipColor: directionColor(r.direction),
      tipRows: [
        { label: 'Value', value: `${fmtValue(r.lastValue, block.unit)} → ${fmtValue(r.thisValue, block.unit)}` },
        { label: 'Change', value: signedPct(r.changePct) },
      ],
    }));

  const absData: HBarDatum[] = block.breakdown
    .filter((r) => r.thisValue != null)
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0))
    .map((r, i) => ({
      key: r.label,
      label: r.label,
      value: r.thisValue as number,
      color: seriesColor(i),
      valueLabel: fmtValue(r.thisValue, block.unit),
      tipTitle: r.label,
      tipRows: [
        { label: block.lastPeriodLabel, value: fmtValue(r.lastValue, block.unit) },
        { label: block.thisPeriodLabel, value: fmtValue(r.thisValue, block.unit) },
        { label: 'Change', value: signedPct(r.changePct) },
      ],
    }));

  const hasBreakdownChart = mode === 'pct' ? pctData.length > 0 : absData.length > 0;

  // Clamp the diverging axis when one segment dwarfs the rest, so small moves stay visible
  // (the clamped bar keeps its true label). Only when the top value is >2x the next.
  const absVals = pctData.map((d) => Math.abs(d.value)).sort((a, b) => b - a);
  const pctDomain = absVals.length > 2 && absVals[0] > absVals[1] * 2 ? Math.max(absVals[1] * 1.25, 0.05) : undefined;
  const hasTrend = !!(block.trend && block.trend.length > 1);
  // Podcast (and any narrative block) renders ONLY the quarter-vs-quarter theme
  // comparison — no chart, no episodes-per-show table, no duplicate consolidated note.
  const isNarrative = !!(block.highlights && block.highlights.length);

  // ---- breakdown table ----
  const cols: Column<BreakdownRow>[] = [
    {
      key: 'label',
      header: 'Breakdown',
      render: (r) => <span className="font-medium text-slate-700">{r.label}</span>,
      sortable: true,
      sortValue: (r) => r.label,
    },
    {
      key: 'last',
      header: block.lastPeriodLabel,
      align: 'right',
      render: (r) => <span className="tnum text-slate-500">{fmtValue(r.lastValue, block.unit)}</span>,
      sortable: true,
      sortValue: (r) => r.lastValue ?? -Infinity,
    },
    {
      key: 'this',
      header: block.thisPeriodLabel,
      align: 'right',
      render: (r) => <span className="tnum font-semibold text-slate-900">{fmtValue(r.thisValue, block.unit)}</span>,
      sortable: true,
      sortValue: (r) => r.thisValue ?? -Infinity,
    },
    {
      key: 'chg',
      header: 'Change',
      align: 'right',
      render: (r) => (
        <span className="tnum font-bold" style={{ color: directionColor(r.direction) }}>
          {signedPct(r.changePct)}
        </span>
      ),
      sortable: true,
      sortValue: (r) => r.changePct ?? 0,
    },
  ];

  return (
    <div className="animate-fade-in">
      {BackBar}

      {/* headline */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${accent}14`, color: accent }}>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <h2 className="font-display text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{block.name}</h2>
              <Badge color={accent}>{block.sector}</Badge>
              <Badge color="#64748B">{block.comparison}</Badge>
              {block.isStale && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-100">
                  <Clock size={11} /> stale data
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] text-slate-500">
              {block.metricLabel}: <span className="font-semibold text-slate-700">{block.lastPeriodLabel}</span>{' '}
              <span className="text-slate-300">→</span>{' '}
              <span className="font-semibold text-slate-700">{block.thisPeriodLabel}</span>
            </p>
          </div>

          <div className="text-right">
            <div className="tnum font-display text-[34px] font-bold leading-none" style={{ color: dir }}>
              {headlineText(block.changePct, block.changeAbs, block.changeDisplay)}
            </div>
            {block.lastValue != null && (
              <div className="tnum mt-1.5 text-[13px] text-slate-500">
                {fmtValue(block.lastValue, block.unit)} <span className="text-slate-300">→</span>{' '}
                <span className="font-semibold text-slate-700">{fmtValue(block.thisValue, block.unit)}</span>
              </div>
            )}
            {(!block.changeDisplay || block.changeDisplay === 'pct') && block.changeAbs != null && (
              <div className="tnum mt-0.5 text-[11.5px] text-slate-400">{signedValue(block.changeAbs, block.unit)} absolute</div>
            )}
          </div>
        </div>
      </Card>

      {/* consolidated note — hidden for narrative blocks (duplicates the theme comparison) */}
      {!isNarrative && block.summary && (
        <Card className="mb-4" accent={accent}>
          <CardHeader
            icon={Quote}
            accent={accent}
            title="Consolidated note — what the podcasts are saying"
            subtitle={`${block.lastPeriodLabel} → ${block.thisPeriodLabel}`}
          />
          <p className="text-[13.5px] leading-relaxed text-slate-700">{block.summary}</p>
        </Card>
      )}

      {/* narrative themes — quarter-over-quarter comparison (e.g. podcast) */}
      {block.highlights && block.highlights.length > 0 && (
        <Card className="mb-4" accent={accent}>
          <CardHeader
            icon={Quote}
            accent={accent}
            title="Recurring themes — last quarter vs this quarter"
            subtitle={
              block.prevHighlights && block.prevHighlights.length
                ? `What the investor podcasts covered: ${block.lastPeriodLabel} → ${block.thisPeriodLabel}`
                : block.tone
            }
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {block.prevHighlights && block.prevHighlights.length > 0 && (
              <ThemeColumn
                label={block.lastPeriodLabel}
                count={block.lastValue}
                tone={block.prevTone}
                themes={block.prevHighlights}
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
          {block.prevHighlights && block.prevHighlights.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="inline-block rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-100">
                new
              </span>
              = theme that appears this quarter but not last quarter · top recurring threads shown per quarter
            </p>
          )}
        </Card>
      )}

      {!isNarrative && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* breakdown chart */}
        <Card className={hasTrend ? 'lg:col-span-3' : 'lg:col-span-5'}>
          <CardHeader
            icon={Icon}
            accent={accent}
            title="Breakdown"
            subtitle={mode === 'pct' ? 'Change by segment, this period vs last' : `Level this period (${block.thisPeriodLabel})`}
            right={
              <Segmented
                size="sm"
                value={mode}
                onChange={(v) => setMode(v as Mode)}
                options={[
                  { value: 'pct', label: '% change' },
                  { value: 'abs', label: 'Absolute' },
                ]}
              />
            }
          />
          {hasBreakdownChart ? (
            <>
              {mode === 'pct' ? (
                <DivergingBars data={pctData} axisFormat={axisPct} labelWidth={168} domain={pctDomain} />
              ) : (
                <HBars data={absData} format={(n) => fmtValue(n, block.unit)} axisFormat={(n) => fmtCompact(n, block.unit)} labelWidth={168} />
              )}
              <div className="mt-2">
                {mode === 'pct' ? (
                  <Legend
                    items={[
                      { label: 'Up', color: DIRECTION_COLOR.up },
                      { label: 'Down', color: DIRECTION_COLOR.down },
                      { label: 'Flat', color: DIRECTION_COLOR.flat },
                    ]}
                  />
                ) : (
                  <Legend items={[{ label: `This period · ${block.thisPeriodLabel}`, color: accent }]} />
                )}
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-[13px] text-slate-400">No breakdown available for this view.</div>
          )}
        </Card>

        {/* trend */}
        {hasTrend && (
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card>
              <CardHeader icon={Icon} accent={accent} title="Trend" subtitle={`${block.metricLabel} over time`} />
              <LineArea
                points={block.trend!.map((t) => ({ label: t.period, value: t.value }))}
                color={accent}
                height={180}
                yAxisFormat={(n) => fmtCompact(n, block.unit)}
                format={(n) => fmtValue(n, block.unit)}
              />
            </Card>
          </div>
        )}
      </div>
      )}

      {/* full breakdown table */}
      {!isNarrative && block.breakdown.length > 0 && (
        <Card className="mt-4" pad={false}>
          <div className="p-4 pb-2">
            <h3 className="font-display text-[15px] font-bold text-slate-900">Period-over-period detail</h3>
            <p className="text-[12px] text-slate-500">{block.lastPeriodLabel} vs {block.thisPeriodLabel} · {block.unit}</p>
          </div>
          <div className="px-4 pb-4">
            <Table
              columns={cols}
              rows={block.breakdown}
              getKey={(r) => r.label}
              initialSort={{ key: 'this', dir: 'desc' }}
              dense
              maxHeight={360}
            />
          </div>
        </Card>
      )}

      {/* secondary metrics */}
      {block.secondaryMetrics && block.secondaryMetrics.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2.5 font-display text-[15px] font-bold text-slate-900">
            More that moved in {block.name}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {block.secondaryMetrics.map((m) => (
              <SecondaryCard key={m.metricLabel} metric={m} accent={accent} />
            ))}
          </div>
        </div>
      )}

      <SourceLine block={block} />
    </div>
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

function SecondaryCard({ metric, accent }: { metric: ChangeBlock; accent: string }) {
  const dir = directionColor(metric.direction);
  const bd = (metric.breakdown || []).filter((r) => r.changePct != null);
  const big =
    metric.changePct != null || (metric.changeDisplay && metric.changeAbs != null)
      ? headlineText(metric.changePct, metric.changeAbs, metric.changeDisplay)
      : fmtValue(metric.thisValue, metric.unit);
  return (
    <Card accent={accent}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-[13.5px] font-bold leading-tight text-slate-900">{metric.metricLabel}</h4>
          <p className="mt-0.5 text-[11.5px] text-slate-500">
            {metric.lastPeriodLabel} <span className="text-slate-300">→</span> {metric.thisPeriodLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum font-display text-[20px] font-bold leading-none" style={{ color: dir }}>
            {big}
          </div>
          {metric.lastValue != null && (
            <div className="tnum mt-1 text-[11px] text-slate-500">
              {fmtValue(metric.lastValue, metric.unit)} → {fmtValue(metric.thisValue, metric.unit)}
            </div>
          )}
        </div>
      </div>
      {bd.length > 0 && (
        <div className="mt-2">
          <DivergingBars
            data={bd.map((r) => ({
              key: r.label,
              label: r.label,
              value: r.changePct as number,
              color: directionColor(r.direction),
              valueLabel: signedPct(r.changePct),
              tipRows: [{ label: 'Value', value: `${fmtValue(r.lastValue, metric.unit)} → ${fmtValue(r.thisValue, metric.unit)}` }],
            }))}
            axisFormat={axisPct}
            labelWidth={140}
            barSize={20}
          />
        </div>
      )}
      {metric.notes && <p className="mt-2 text-[11px] italic leading-snug text-slate-500">{metric.notes}</p>}
    </Card>
  );
}

function SourceLine({ block }: { block: ChangeBlock }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-[12px] text-slate-500">
      <div className="min-w-0">
        {block.notes && <p className="mb-1 italic leading-snug text-slate-500">{block.notes}</p>}
        <p>
          Source: <span className="font-medium text-slate-700">{block.sourceName}</span> · as of{' '}
          <span className="tnum">{dateLabel(block.asOf)}</span>
        </p>
      </div>
    </div>
  );
}
