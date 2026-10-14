import { useState } from 'react';
import { ChevronLeft, ExternalLink, AlertTriangle, Clock } from 'lucide-react';
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
import { signedPct, fmtValue, signedValue, fmtCompact, dateLabel, axisPct } from '../lib/format';
import type { BreakdownRow } from '../types';

type Mode = 'pct' | 'abs';

export function SystemView({
  block,
  onBack,
  backLabel = 'Overview',
}: {
  block: ChangeBlock;
  onBack: () => void;
  backLabel?: string;
}) {
  const [mode, setMode] = useState<Mode>('pct');
  const Icon = iconFor(block.systemId, block.sector);
  const accent = sectorColor(block.sector);
  const dir = directionColor(block.direction);

  const BackBar = (
    <button
      onClick={onBack}
      className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-500 transition hover:text-slate-800"
    >
      <ChevronLeft size={16} /> Back to {backLabel}
    </button>
  );

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
              {signedPct(block.changePct)}
            </div>
            <div className="tnum mt-1.5 text-[13px] text-slate-500">
              {fmtValue(block.lastValue, block.unit)} <span className="text-slate-300">→</span>{' '}
              <span className="font-semibold text-slate-700">{fmtValue(block.thisValue, block.unit)}</span>
            </div>
            <div className="tnum mt-0.5 text-[11.5px] text-slate-400">{signedValue(block.changeAbs, block.unit)} absolute</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* breakdown chart */}
        <Card className="lg:col-span-3">
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
                <DivergingBars data={pctData} axisFormat={axisPct} labelWidth={168} />
              ) : (
                <HBars data={absData} format={(n) => fmtValue(n, block.unit)} labelWidth={168} />
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

        {/* trend + table */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {block.trend && block.trend.length > 1 && (
            <Card>
              <CardHeader icon={Icon} accent={accent} title="Trend" subtitle={`${block.metricLabel} over time`} />
              <LineArea
                points={block.trend.map((t) => ({ label: t.period, value: t.value }))}
                color={accent}
                height={180}
                yAxisFormat={(n) => fmtCompact(n, block.unit)}
                format={(n) => fmtValue(n, block.unit)}
              />
            </Card>
          )}
        </div>
      </div>

      {/* full breakdown table */}
      {block.breakdown.length > 0 && (
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

function SecondaryCard({ metric, accent }: { metric: ChangeBlock; accent: string }) {
  const dir = directionColor(metric.direction);
  const bd = (metric.breakdown || []).filter((r) => r.changePct != null);
  const big = metric.changePct != null ? signedPct(metric.changePct) : fmtValue(metric.thisValue, metric.unit);
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
  );
}
