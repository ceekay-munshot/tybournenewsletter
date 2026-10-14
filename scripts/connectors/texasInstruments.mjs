// Texas Instruments Prices — per-category chip price indices (QoQ).
// GET series -> {series:{id:[[date,index]]}}. Data is committed and ends ~Apr 2026,
// so this compares the two most recent COMPLETE quarters (Q1 '26 vs Q4 '25) and is stale.
import { getJson } from '../lib/http.mjs';
import { quarterLabel, quarterOf, prevQuarter } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

const LABELS = {
  amp_audio: 'Amplifiers · Audio',
  amp_comparators: 'Amplifiers · Comparators',
  amp_op: 'Amplifiers · Op-amps',
  adc: 'Converters · ADC',
  dac: 'Converters · DAC',
  conv_other: 'Converters · Other',
  lin_vr: 'Power · Linear VR',
  switching_vr: 'Power · Switching VR',
  other_pm: 'Power · Other',
  mcu_16bit: 'MCU · 16-bit',
  mcu_32bit: 'MCU · 32-bit',
  mcu_8bit: 'MCU · 8-bit',
  mcu_other: 'MCU · Other',
};

const END_MONTH = { 1: 3, 2: 6, 3: 9, 4: 12 };

export async function connect(system) {
  const d = await getJson(system.source.series);
  const series = d?.series || {};
  const ids = Object.keys(series);
  if (!ids.length) throw new Error('no TI series');

  const allDates = ids.flatMap((id) => series[id].map((p) => p[0])).sort();
  const latest = allDates[allDates.length - 1];
  const latestQ = quarterOf(latest);
  // Is the latest quarter complete? (a point in its end-month, late enough)
  const lm = +latest.slice(5, 7);
  const ld = +latest.slice(8, 10);
  const qn = +latestQ.slice(-1);
  const complete = lm === END_MONTH[qn] && ld >= 25;
  const thisQ = complete ? latestQ : prevQuarter(latestQ);
  const lastQ = prevQuarter(thisQ);

  // last index value recorded within a given quarter
  const lastInQuarter = (points, qid) => {
    let val = null;
    for (const [date, idx] of points) if (quarterOf(date) === qid) val = idx;
    return val;
  };

  let sumThis = 0;
  let sumLast = 0;
  let n = 0;
  const breakdown = ids
    .map((id) => {
      const tv = lastInQuarter(series[id], thisQ);
      const lv = lastInQuarter(series[id], lastQ);
      const cp = pctChange(tv, lv);
      if (tv != null && lv != null) {
        sumThis += tv;
        sumLast += lv;
        n += 1;
      }
      return { label: LABELS[id] || id, thisValue: tv, lastValue: lv, changePct: cp, direction: directionOf(cp) };
    })
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  if (!n) throw new Error('no comparable TI quarters');
  const thisValue = sumThis / n;
  const lastValue = sumLast / n;

  return makeBlock(system, {
    unit: 'price index',
    comparison: 'QoQ',
    thisPeriodLabel: quarterLabel(thisQ),
    lastPeriodLabel: quarterLabel(lastQ),
    thisValue,
    lastValue,
    changePct: pctChange(thisValue, lastValue),
    asOf: latest,
    isStale: true,
    breakdown,
    notes: 'Latest committed data ~Apr 2026; the live quarter needs a Mouser key. Headline = mean across ' + n + ' TI product-line indices.',
  });
}
