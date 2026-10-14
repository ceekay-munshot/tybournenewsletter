// AI Compute Pricing — equal-weighted basket of comparable model input prices (QoQ, QTD).
// history -> quarters[] (avg + qoq); signal -> per-provider price moves + callouts.
import { getJson } from '../lib/http.mjs';
import { quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

export async function connect(system) {
  const [hist, sig] = await Promise.all([
    getJson(system.source.history),
    getJson(system.source.signal),
  ]);

  const quarters = Array.isArray(hist?.quarters) ? hist.quarters : [];
  if (quarters.length < 2) throw new Error('pricing-history returned <2 quarters');
  const thisQ = quarters[0];
  const lastQ = quarters[1];

  const thisValue = thisQ.avg ?? null;
  const lastValue = lastQ.avg ?? null;
  const changePct = thisQ.qoq ?? null; // already a fraction

  // Trend: basket average per quarter, chronological.
  const trend = [...quarters]
    .reverse()
    .filter((q) => q.avg != null)
    .map((q) => ({ period: quarterLabel(q.id), value: q.avg }));

  // Breakdown: per-provider price QoQ from the signal's latest comparable quarter.
  const signalQ = (Array.isArray(sig?.quarters) ? sig.quarters : [])[0];
  const rows = Array.isArray(signalQ?.rows) ? signalQ.rows : [];
  const breakdown = rows.map((r) => {
    const qoq = r.priceQoq ?? null; // fraction
    const avg = r.avg ?? null;
    // Prior = avg / (1 + qoq) — exact algebra from the reported QoQ, not a guess.
    const lastV = avg != null && qoq != null && 1 + qoq !== 0 ? avg / (1 + qoq) : null;
    return {
      label: r.label || r.slug,
      thisValue: avg,
      lastValue: lastV,
      changePct: qoq,
      direction: directionOf(qoq),
    };
  });

  // asOf: QTD latest data = quarter start + (dayCount-1) days.
  let asOf = new Date().toISOString();
  if (thisQ.start && thisQ.dayCount) {
    const d = new Date(`${thisQ.start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (Number(thisQ.dayCount) - 1));
    asOf = d.toISOString();
  }

  const callout = (Array.isArray(sig?.callouts) ? sig.callouts : [])[0];
  const notes = callout
    ? `${callout.title}: ${callout.provider} (${callout.detail}). Equal-weighted basket, QTD.`
    : 'Equal-weighted basket of comparable models, quarter-to-date.';

  return makeBlock(system, {
    unit: '$/1M tokens',
    comparison: 'QoQ',
    thisPeriodLabel: `${quarterLabel(thisQ.id)}${thisQ.partial ? ' (QTD)' : ''}`,
    lastPeriodLabel: quarterLabel(lastQ.id),
    thisValue,
    lastValue,
    changePct,
    direction: directionOf(changePct),
    asOf,
    breakdown,
    trend,
    notes,
  });
}
