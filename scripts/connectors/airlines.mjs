// Airline Demand — TSA daily passenger throughput rolled to complete quarters (QoQ).
// tsa.json -> days[{date,throughput}] (+ _meta.real_days). data.json -> series.rpk_yoy by region.
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, monthLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

export async function connect(system) {
  const base = system.source.base;
  const tsa = await getJson(`${base}/tsa.json`);
  const realSet = new Set(tsa?._meta?.real_days || []);
  const days = (tsa?.days || []).filter((d) => d && d.throughput != null && (realSet.size ? realSet.has(d.date) : true));
  if (!days.length) throw new Error('no real TSA days');

  const sumQ = {};
  const cntQ = {};
  for (const d of days) {
    const q = quarterOf(d.date);
    sumQ[q] = (sumQ[q] || 0) + d.throughput;
    cntQ[q] = (cntQ[q] || 0) + 1;
  }
  const completeQs = Object.keys(sumQ)
    .filter((q) => cntQ[q] >= 80)
    .sort();
  const thisQ = completeQs[completeQs.length - 1];
  const lastQ = completeQs[completeQs.length - 2];
  if (!thisQ || !lastQ) throw new Error('need two complete quarters of TSA data');
  const thisMean = Math.round(sumQ[thisQ] / cntQ[thisQ]);
  const lastMean = Math.round(sumQ[lastQ] / cntQ[lastQ]);

  // quarterly mean throughput trend (last ~8 complete quarters)
  const trend = completeQs.slice(-8).map((q) => ({ period: quarterLabel(q), value: Math.round(sumQ[q] / cntQ[q]) }));

  // breakdown: regional RPK YoY growth (latest month) + IATA industry secondary
  let breakdown = [];
  const secondary = [];
  try {
    const data = await getJson(`${base}/data.json`);
    const ry = data?.series?.rpk_yoy;
    const months = data?.months || [];
    if (ry) {
      const regions = Object.keys(ry).filter((r) => r !== 'Industry');
      breakdown = regions
        .map((r) => {
          const arr = ry[r] || [];
          const v = arr[arr.length - 1];
          return { label: r, thisValue: v ?? null, lastValue: null, changePct: v != null ? v / 100 : null, direction: directionOf(v != null ? v / 100 : null) };
        })
        .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
      const ind = ry['Industry'];
      if (ind && ind.length >= 2) {
        const t = ind[ind.length - 1];
        const l = ind[ind.length - 2];
        secondary.push(
          makeBlock(system, {
            metricLabel: 'Industry RPK (YoY growth)',
            unit: '% YoY',
            comparison: 'MoM',
            thisPeriodLabel: monthLabel(months[months.length - 1] || ''),
            lastPeriodLabel: monthLabel(months[months.length - 2] || ''),
            thisValue: t,
            lastValue: l,
            changePct: null,
            changeAbs: Math.round((t - l) * 10) / 10,
            changeDisplay: 'pp',
            direction: directionOf(t - l),
            asOf: tsa?._meta?.latest_date || thisQ,
            breakdown: [],
            notes: 'IATA global industry RPK, year-over-year; change shown as month-over-month acceleration (pp).',
          })
        );
      }
    }
  } catch {
    /* regional feed optional */
  }

  return makeBlock(system, {
    unit: 'daily pax',
    comparison: 'QoQ',
    thisPeriodLabel: quarterLabel(thisQ),
    lastPeriodLabel: quarterLabel(lastQ),
    thisValue: thisMean,
    lastValue: lastMean,
    changePct: pctChange(thisMean, lastMean),
    asOf: tsa?._meta?.latest_date || thisQ,
    breakdown,
    trend,
    secondaryMetrics: secondary,
    notes:
      'Mean daily TSA checkpoint throughput over complete calendar quarters. Breakdown = regional RPK YoY growth (latest month, IATA).',
  });
}
