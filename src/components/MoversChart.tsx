import { DivergingBars, type DivergingDatum } from './charts/DivergingBars';
import type { ChangeBlock } from '../types';
import { directionColor } from '../lib/brand';
import { headlineText, headlineMagnitude, fmtValue } from '../lib/format';

const periodArrow = (b: ChangeBlock) => `${b.lastPeriodLabel} → ${b.thisPeriodLabel}`;
// Axis values are mixed units (%, pp, pts) — show a plain signed number; the bar
// label carries the real unit.
const axisNum = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n) < 1 ? Math.abs(n).toFixed(1) : Math.abs(n).toFixed(0)}`;

/** One horizontal bar per system = its headline change, biggest-first. Systems with
 *  no plottable headline (narrative cards like Podcast) are excluded. Click to drill in. */
export function MoversChart({
  systems,
  onSelect,
}: {
  systems: ChangeBlock[];
  onSelect: (systemId: string) => void;
}) {
  const live = systems
    .map((b) => ({ b, mag: headlineMagnitude(b.changePct, b.changeAbs, b.changeDisplay) }))
    .filter((x) => x.mag != null)
    .sort((a, b) => Math.abs(b.mag as number) - Math.abs(a.mag as number));

  if (!live.length) {
    return <div className="py-10 text-center text-[13px] text-slate-400">No comparable movements yet.</div>;
  }

  const mags = live.map((x) => Math.abs(x.mag as number)).sort((a, b) => b - a);
  const domain = mags.length >= 4 ? Math.max(1, mags[3]) : mags[mags.length - 1] || 1;

  const data: DivergingDatum[] = live.map(({ b, mag }) => ({
    key: b.systemId,
    label: b.name,
    sublabel: periodArrow(b),
    value: mag as number,
    color: directionColor(b.direction),
    valueLabel: headlineText(b.changePct, b.changeAbs, b.changeDisplay),
    tipTitle: b.name,
    tipColor: directionColor(b.direction),
    tipRows: [
      { label: 'Period', value: periodArrow(b) },
      { label: 'Value', value: `${fmtValue(b.lastValue, b.unit)} → ${fmtValue(b.thisValue, b.unit)}` },
      { label: 'Change', value: headlineText(b.changePct, b.changeAbs, b.changeDisplay) },
    ],
    tipNote: `${b.comparison} · click to open ${b.name}`,
  }));

  return <DivergingBars data={data} axisFormat={axisNum} labelWidth={190} barSize={30} domain={domain} onClick={onSelect} />;
}
