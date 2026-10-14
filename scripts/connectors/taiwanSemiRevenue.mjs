// Taiwan Semiconductor Revenue — TWSE/MOPS monthly filings bucketed into quarters (QoQ).
// EXCLUDE Wiwynn (ticker 6669) — it consolidates into Wistron and would double-count.
import { getJson } from '../lib/http.mjs';
import {
  monthToQuarter,
  prevQuarter,
  quarterLabel,
  quarterMonths,
  monthLabel,
} from '../lib/quarters.mjs';
import { makeBlock, mkBreakdown, pctChange } from '../lib/changeBlock.mjs';

const isWiwynn = (r) => String(r.ticker) === '6669' || /wiwynn/i.test(r.company_name || '');
const toBn = (thousands) => (thousands == null ? null : thousands / 1e6); // TWD thousands -> TWD bn

export async function connect(system) {
  const res = await getJson(system.source.url);
  const rows = (Array.isArray(res?.rows) ? res.rows : []).filter((r) => !isWiwynn(r));
  if (!rows.length) throw new Error('analytics.json returned no rows');

  const months = [...new Set(rows.map((r) => r.month).filter(Boolean))].sort();
  const latestMonth = months[months.length - 1];
  const thisQid = monthToQuarter(latestMonth); // e.g. 2026-Q3
  const lastQid = prevQuarter(thisQid); // e.g. 2026-Q2
  if (!thisQid) throw new Error('could not derive quarter from latest month');

  // Sum present revenue only — a missing filing is null, never 0.
  const sumOver = (predicate, qid) => {
    const ms = new Set(quarterMonths(qid));
    let sum = null;
    for (const r of rows) {
      if (ms.has(r.month) && predicate(r) && r.revenue_twd_thousands != null) {
        sum = (sum ?? 0) + r.revenue_twd_thousands;
      }
    }
    return sum;
  };

  const thisValue = toBn(sumOver(() => true, thisQid));
  const lastValue = toBn(sumOver(() => true, lastQid));
  const changePct = pctChange(thisValue, lastValue);

  // Per-bucket (supply-chain stage) breakdown, largest first.
  const buckets = [...new Set(rows.map((r) => r.bucket).filter(Boolean))];
  const breakdown = buckets
    .map((b) =>
      mkBreakdown(b, toBn(sumOver((r) => r.bucket === b, thisQid)), toBn(sumOver((r) => r.bucket === b, lastQid)))
    )
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  // Monthly total trend (TWD bn), chronological.
  const trend = months.map((m) => {
    let s = null;
    for (const r of rows) {
      if (r.month === m && r.revenue_twd_thousands != null) s = (s ?? 0) + r.revenue_twd_thousands;
    }
    return { period: monthLabel(m), value: s == null ? 0 : s / 1e6 };
  });

  return makeBlock(system, {
    unit: 'TWD bn',
    comparison: 'QoQ',
    thisPeriodLabel: quarterLabel(thisQid),
    lastPeriodLabel: quarterLabel(lastQid),
    thisValue,
    lastValue,
    changePct,
    asOf: `${latestMonth}-01`,
    breakdown,
    trend,
    notes: 'Excludes Wiwynn (consolidated into Wistron). Monthly filings summed into calendar quarters.',
  });
}
