// CPU Prices — PassMark street-price cohorts (QoQ, current quarter is live QTD).
// GET period-aggregates -> data.quarterly[]. Prices are in CENTS (divide by 100).
import { getJson } from '../lib/http.mjs';
import { quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, mkBreakdown, directionOf } from '../lib/changeBlock.mjs';

export async function connect(system) {
  const res = await getJson(system.source.api);
  if (!res?.success || !Array.isArray(res?.data?.quarterly) || res.data.quarterly.length < 2) {
    throw new Error('period-aggregates returned no comparable quarters');
  }
  const quarterly = res.data.quarterly;
  const thisQ = quarterly[0]; // live QTD
  const lastQ = quarterly[1];
  const cells = Array.isArray(thisQ.matched_vs_prior) ? thisQ.matched_vs_prior : [];
  if (!cells.length) throw new Error('no matched_vs_prior cohort cells');

  // Headline = SKU-count-weighted mean of each cohort's price change.
  let wSum = 0;
  let wPct = 0;
  let wThisCents = 0;
  let wLastCents = 0;
  const breakdown = cells.map((c) => {
    const cur = c.current_avg_cents;
    const prior = c.prior_avg_cents;
    const w = Number(c.cohort_sku_count) || 0;
    const cellPct = prior && Number.isFinite(prior) ? (cur - prior) / prior : null;
    if (cellPct != null && w > 0) {
      wSum += w;
      wPct += cellPct * w;
      wThisCents += cur * w;
      wLastCents += prior * w;
    }
    return mkBreakdown(`${c.segment} · ${c.manufacturer}`, cur / 100, prior / 100, cellPct);
  });

  const changePct = wSum > 0 ? wPct / wSum : null;
  const thisValue = wSum > 0 ? wThisCents / wSum / 100 : null;
  const lastValue = wSum > 0 ? wLastCents / wSum / 100 : null;

  // Trend: SKU-weighted blended average price per recent month (chronological).
  const monthly = Array.isArray(res.data.monthly) ? res.data.monthly : [];
  const trend = [...monthly]
    .reverse()
    .map((mo) => {
      const mc = Array.isArray(mo.matched_vs_prior) ? mo.matched_vs_prior : [];
      let s = 0;
      let w = 0;
      for (const c of mc) {
        const k = Number(c.cohort_sku_count) || 0;
        if (c.current_avg_cents != null && k > 0) {
          s += c.current_avg_cents * k;
          w += k;
        }
      }
      return w > 0 ? { period: quarterLabelFromMonth(mo.period_id, mo.period_label), value: s / w / 100 } : null;
    })
    .filter(Boolean);

  return makeBlock(system, {
    unit: '$',
    comparison: 'QoQ',
    thisPeriodLabel: `${quarterLabel(thisQ.period_id)} (QTD)`,
    lastPeriodLabel: quarterLabel(lastQ.period_id),
    thisValue,
    lastValue,
    changePct,
    direction: directionOf(changePct),
    asOf: thisQ.period_start,
    breakdown,
    trend,
    notes:
      'PassMark street price, not direct vendor retail. Headline is the SKU-weighted mean of 6 segment×vendor cohort changes.',
  });
}

// monthly period labels come as "Oct-26"; keep the API label but fall back cleanly.
function quarterLabelFromMonth(periodId, periodLabel) {
  return periodLabel || periodId || '';
}
