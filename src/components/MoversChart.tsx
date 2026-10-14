import { DivergingBars, type DivergingDatum } from './charts/DivergingBars';
import type { ChangeBlock } from '../types';
import { directionColor } from '../lib/brand';
import { signedPct, fmtValue, axisPct } from '../lib/format';

const periodArrow = (b: ChangeBlock) => `${b.lastPeriodLabel} → ${b.thisPeriodLabel}`;

/** One horizontal bar per system = its headline change, biggest-first. Click to drill in. */
export function MoversChart({
  systems,
  onSelect,
}: {
  systems: ChangeBlock[];
  onSelect: (systemId: string) => void;
}) {
  const live = systems
    .filter((b) => b.status !== 'error' && b.changePct != null)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));

  if (!live.length) {
    return <div className="py-10 text-center text-[13px] text-slate-400">No comparable movements yet.</div>;
  }

  // Cap the axis at the 4th-largest magnitude so the handful of extreme outliers
  // (e.g. +500%) don't crush the rest; clamped bars still show their true value.
  const mags = live.map((b) => Math.abs(b.changePct as number)).sort((a, b) => b - a);
  const domain = mags.length >= 4 ? Math.max(0.05, mags[3]) : mags[mags.length - 1] || 0.05;

  const data: DivergingDatum[] = live.map((b) => ({
    key: b.systemId,
    label: b.name,
    sublabel: periodArrow(b),
    value: b.changePct as number,
    color: directionColor(b.direction),
    valueLabel: signedPct(b.changePct),
    tipTitle: b.name,
    tipColor: directionColor(b.direction),
    tipRows: [
      { label: 'Period', value: periodArrow(b) },
      {
        label: 'Value',
        value: `${fmtValue(b.lastValue, b.unit)} → ${fmtValue(b.thisValue, b.unit)}`,
      },
      { label: 'Change', value: signedPct(b.changePct) },
    ],
    tipNote: `${b.comparison} · click to open ${b.name}`,
  }));

  return <DivergingBars data={data} axisFormat={axisPct} labelWidth={190} barSize={30} domain={domain} onClick={onSelect} />;
}
