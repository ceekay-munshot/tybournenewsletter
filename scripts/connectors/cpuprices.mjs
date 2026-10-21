// CPU Prices — PassMark street price, Server / Laptop / Desktop × Intel / AMD,
// like-for-like, at THREE windows (Weekly / MoM / QoQ) straight from the live
// period-aggregates endpoint (which already ships weekly, monthly AND quarterly).
// Default MoM. Each segment row carries its Intel/AMD split. Headline is the
// SKU-cohort-weighted mean of the solid matched cells. Prices are in CENTS.
//
// Colour note: green = price UP (higher cost for the buyer) — matches the source
// dashboard's own convention, not the usual "green = good".
import { getJson } from '../lib/http.mjs';
import { makeBlock, directionOf, attachPrev, attachSeries } from '../lib/changeBlock.mjs';

const BIG_MOVE = 0.02; // |change| >= 2% flags a big move
const MIN_COHORT = 10; // a cell below this many matched SKUs is flagged "thin", kept out of the headline
const SEG_ORDER = ['Server', 'Laptop', 'Desktop'];
const cents = (c) => (c == null ? null : c / 100);

const PERIODS = [
  { comparison: 'WoW', label: 'Week', key: 'weekly' },
  { comparison: 'MoM', label: 'Month', key: 'monthly' },
  { comparison: 'QoQ', label: 'Quarter', key: 'quarterly' },
];

function buildView(cur, prior, comparison, label) {
  const cells = (cur && Array.isArray(cur.matched_vs_prior) ? cur.matched_vs_prior : []).filter(
    (c) => c && c.prior_avg_cents && c.current_avg_cents != null
  );
  const thisLabel = cur?.period_label || '—';
  const lastLabel = prior?.period_label || '—';
  if (!cells.length) {
    return {
      comparison,
      label,
      available: false,
      unavailableReason: 'No like-for-like cohort for this window yet.',
      thisPeriodLabel: thisLabel,
      lastPeriodLabel: lastLabel,
      thisValue: null,
      lastValue: null,
      changePct: null,
      changeAbs: null,
      direction: 'flat',
      breakdown: [],
    };
  }

  const segs = [...new Set(cells.map((c) => c.segment))].sort(
    (a, b) => (SEG_ORDER.indexOf(a) + 1 || 99) - (SEG_ORDER.indexOf(b) + 1 || 99)
  );

  const rows = [];
  let wSum = 0;
  let wPct = 0;
  for (const seg of segs) {
    const segCells = cells.filter((c) => c.segment === seg);
    let sw = 0;
    let sp = 0;
    let sn = 0;
    let st = 0;
    const sub = [];
    for (const c of segCells) {
      const w = Number(c.cohort_sku_count) || 0;
      const cp = c.prior_avg_cents ? (c.current_avg_cents - c.prior_avg_cents) / c.prior_avg_cents : null;
      const thin = w < MIN_COHORT;
      if (cp != null && w > 0 && !thin) {
        sw += w;
        sp += cp * w;
        sn += c.current_avg_cents * w;
        st += c.prior_avg_cents * w;
        wSum += w;
        wPct += cp * w;
      }
      sub.push({
        label: c.manufacturer,
        thisValue: cents(c.current_avg_cents),
        lastValue: cents(c.prior_avg_cents),
        changePct: cp,
        direction: directionOf(cp),
        bigMove: cp != null && Math.abs(cp) >= BIG_MOVE,
        note: thin ? `thin · ${w} SKUs` : undefined,
      });
    }
    const segPct = sw ? sp / sw : null;
    rows.push({
      label: seg,
      thisValue: sw ? cents(sn / sw) : null,
      lastValue: sw ? cents(st / sw) : null,
      changePct: segPct,
      direction: directionOf(segPct),
      bigMove: segPct != null && Math.abs(segPct) >= BIG_MOVE,
      sub,
    });
  }

  const active = wSum > 0;
  const changePct = active ? wPct / wSum : null;
  const moved = rows.filter((r) => r.bigMove).length;
  const summary = active
    ? `${label}-on-${label.toLowerCase()} CPU street price ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(
        changePct * 100
      ).toFixed(1)}% across server / laptop / desktop (Intel & AMD)${
        moved ? `; ${moved} segment${moved > 1 ? 's' : ''} moved more than ${BIG_MOVE * 100}%` : ''
      }.`
    : undefined;

  return {
    comparison,
    label,
    available: active,
    thisPeriodLabel: thisLabel,
    lastPeriodLabel: lastLabel,
    // blended $ across segments is meaningless, so the headline shows only the %.
    thisValue: null,
    lastValue: null,
    changePct,
    changeAbs: null,
    direction: directionOf(changePct),
    bigMove: changePct != null && Math.abs(changePct) >= BIG_MOVE,
    breakdown: rows,
    summary,
  };
}

// Build the last-N period-views (arr[k] vs arr[k+1], newest first) and attach them as a
// series to the latest view + its rows, so the table shows one column per period.
function attachSeries4(latest, arr, comparison, label, n = 4) {
  const vs = [];
  for (let k = 0; k < n; k++) {
    if (!arr[k] || !arr[k + 1]) break;
    vs.push(buildView(arr[k], arr[k + 1], comparison, label));
  }
  attachSeries(latest, vs);
}

export async function connect(system) {
  const res = await getJson(system.source.api);
  if (!res?.success || !res?.data) throw new Error('period-aggregates returned no data');
  const d = res.data;

  const views = PERIODS.map((p) => {
    const arr = Array.isArray(d[p.key]) ? d[p.key] : [];
    const latest = buildView(arr[0], arr[1], p.comparison, p.label);
    // one step further back, so the table shows two consecutive periods of trend
    if (latest.available && arr[2]) {
      const prior = buildView(arr[1], arr[2], p.comparison, p.label);
      if (prior.available) {
        attachPrev(latest.breakdown, prior.breakdown);
        latest.prevLabel = prior.lastPeriodLabel;
        latest.prevValue = prior.lastValue; // the Aug value (prior pair's "from")
        latest.prevChangePct = prior.changePct;
        latest.prevChangeAbs = prior.changeAbs;
        latest.prevDirection = prior.direction;
      }
    }
    // last 4 periods as a series (value + change columns)
    if (latest.available) attachSeries4(latest, arr, p.comparison, p.label, 4);
    return latest;
  });
  const def = views.find((v) => v.comparison === 'MoM' && v.available) || views.find((v) => v.available) || views[1];
  const asOf = d.monthly?.[0]?.last_scraped_at || d.monthly?.[0]?.period_start || new Date().toISOString();

  const block = makeBlock(system, {
    unit: '$',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: null,
    lastValue: null,
    changePct: def.changePct,
    direction: def.direction,
    asOf,
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      (d.source_note ? `${d.source_note} ` : '') +
      'Server/Laptop/Desktop × Intel/AMD, like-for-like (items priced in both captures). Green = price up (higher cost). Weekly/monthly/quarterly from PassMark street-price aggregates.',
  });
  block.views = views;
  block.breakdownNoun = 'segment';
  block.subNoun = 'vendor';
  block.changeNoun = 'Price change';
  return block;
}
