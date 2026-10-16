// GPU Cloud Pricing — getdeploying street rental rates ($/GPU-hour), per SKU, at
// MoM and QoQ (there is no weekly series, so Weekly is honestly unavailable). Headline
// is the Nvidia H100 (the industry benchmark); the breakdown covers all tracked GPUs,
// each as this-month vs last-month (with the current month flagged MTD).
import { getJson } from '../lib/http.mjs';
import { quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const BIG_MOVE = 0.02;
const SKU_ORDER = ['Nvidia H100', 'Nvidia H200', 'Nvidia B200', 'Nvidia GB200', 'Nvidia A100', 'Nvidia L40S'];
const HEAD = 'Nvidia H100';
const shortSku = (s) => s.replace('Nvidia ', '');

const unavail = (comparison, label, reason) => ({
  comparison,
  label,
  available: false,
  unavailableReason: reason || 'Not available for this window.',
  thisPeriodLabel: '—',
  lastPeriodLabel: '—',
  thisValue: null,
  lastValue: null,
  changePct: null,
  changeAbs: null,
  direction: 'flat',
  breakdown: [],
});

function seriesView(seriesMap, comparison, label, labelFn) {
  if (!seriesMap) return unavail(comparison, label);
  const skus = SKU_ORDER.filter((s) => Array.isArray(seriesMap[s]) && seriesMap[s].length >= 2);
  if (!skus.length) return unavail(comparison, label);

  const pick = (sku) => {
    const arr = [...seriesMap[sku]].sort((a, b) => String(a.period).localeCompare(String(b.period)));
    const now = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    const np = now?.headlinePricePerHour ?? null;
    const pp = prev?.headlinePricePerHour ?? null;
    const cp = np != null && pp ? (np - pp) / pp : null;
    return { now, prev, np, pp, cp };
  };

  const rows = skus.map((sku) => {
    const p = pick(sku);
    return {
      label: shortSku(sku),
      thisValue: p.np,
      lastValue: p.pp,
      changePct: p.cp,
      direction: directionOf(p.cp),
      bigMove: p.cp != null && Math.abs(p.cp) >= BIG_MOVE,
    };
  });

  const headSku = seriesMap[HEAD] && seriesMap[HEAD].length >= 2 ? HEAD : skus[0];
  const h = pick(headSku);
  const mtd = h.now?.isMTD ? ' (MTD)' : h.now?.isQTD ? ' (QTD)' : '';

  const biggest = [...rows].filter((r) => r.changePct != null).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
  const summary =
    h.cp != null
      ? `${label}-on-${label.toLowerCase()} ${shortSku(headSku)} rental ${h.cp >= 0 ? 'up' : 'down'} ${Math.abs(
          h.cp * 100
        ).toFixed(1)}% to $${h.np?.toFixed(2)}/hr${
          biggest && biggest.label !== shortSku(headSku)
            ? `; ${biggest.label} the standout at ${biggest.changePct >= 0 ? '+' : ''}${(biggest.changePct * 100).toFixed(1)}%`
            : ''
        }.`
      : undefined;

  return {
    comparison,
    label,
    available: h.cp != null,
    thisPeriodLabel: (labelFn(h.now) || '—') + mtd,
    lastPeriodLabel: labelFn(h.prev) || '—',
    thisValue: h.np,
    lastValue: h.pp,
    changePct: h.cp,
    changeAbs: h.np != null && h.pp != null ? h.np - h.pp : null,
    direction: directionOf(h.cp),
    bigMove: h.cp != null && Math.abs(h.cp) >= BIG_MOVE,
    breakdown: rows,
    summary,
  };
}

export async function connect(system) {
  const d = await getJson(system.source.history);
  if (!d?.success || !d?.monthly) throw new Error('gpu financial endpoint returned no data');

  const views = [
    unavail('WoW', 'Week', 'GPU rental is tracked monthly here — no weekly series.'),
    seriesView(d.monthly.series, 'MoM', 'Month', (e) => e?.label),
    seriesView(d.quarterly?.series, 'QoQ', 'Quarter', (e) => (e?.period ? quarterLabel(e.period) : e?.label)),
  ];
  const def = views.find((v) => v.comparison === 'MoM' && v.available) || views.find((v) => v.available) || views[1];
  const asOf = d.latestRealSnapshotDate || d.latestDateAny || new Date().toISOString().slice(0, 10);

  const block = makeBlock(system, {
    unit: '$/GPU-hr',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: def.changePct,
    direction: def.direction,
    asOf,
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      'Street GPU rental rates ($/GPU-hour), provider-median across clouds (getdeploying). Headline = Nvidia H100 (the benchmark); breakdown covers all tracked GPUs. Monthly/quarterly only — no weekly series.',
  });
  block.views = views;
  block.breakdownNoun = 'GPU';
  block.changeNoun = 'Price change';
  return block;
}
