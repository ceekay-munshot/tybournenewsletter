// Taiwan Semiconductor Revenue — TWSE/MOPS monthly filings, by supply-chain stage.
// Default MoM (the native monthly cadence) with a QoQ toggle; there is no weekly
// series (issuers file monthly). The headline and per-stage breakdown are LIKE-FOR-LIKE:
// only companies that reported BOTH periods count, so a late filer in the newest month
// can't make the whole group look like it shrank. (Raw-sum MoM reads -2% right now purely
// because 3 names haven't filed September yet; like-for-like it's +3.5%.)
//
// EXCLUDE Wiwynn (ticker 6669) — it consolidates into Wistron and would double-count.
import { getJson } from '../lib/http.mjs';
import { monthLabel, quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const isWiwynn = (r) => String(r.ticker) === '6669' || /wiwynn/i.test(r.company_name || r.display_name || '');
const toBn = (thousands) => (thousands == null ? null : thousands / 1e6); // TWD thousands -> TWD bn
const MOM_BIG = 0.08; // a monthly revenue swing >= 8% is a big move for these names
const QOQ_BIG = 0.15;
const Z_BIG = 1.8; // or a stage that diverges >=1.8 robust-z from its peers

// A few canonical stage names are long; shorten for the chart without losing meaning.
const SHORT = {
  'Semi Equipment / Consumables': 'Semi Equip / Consumables',
  'Substrate / AI PCB / Materials': 'Substrate / AI PCB',
  'Power / Data Center Electrical': 'Power / DC Electrical',
  'Legacy / Mature Node Control Group': 'Legacy / Mature Node',
  'Advanced Packaging / Test': 'Adv Packaging / Test',
};
const shortStage = (b) => SHORT[b] || b;

const qOf = (m) => {
  const mm = /^(\d{4})-(\d{2})/.exec(m || '');
  if (!mm) return null;
  return `${mm[1]}-Q${Math.floor((parseInt(mm[2], 10) - 1) / 3) + 1}`;
};
const qMonths = (q) => {
  const mm = /^(\d{4})-Q([1-4])$/.exec(q || '');
  if (!mm) return [];
  const s = (parseInt(mm[2], 10) - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${mm[1]}-${String(s + i).padStart(2, '0')}`);
};

// Median + MAD → robust z-score, to find the stage that diverges most from its peers.
function robustZ(values) {
  const xs = values.filter((v) => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (xs.length < 3) return () => 0;
  const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  const dev = xs.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = dev.length % 2 ? dev[(dev.length - 1) / 2] : (dev[dev.length / 2 - 1] + dev[dev.length / 2]) / 2;
  const scale = 1.4826 * mad;
  return (v) => (v == null || !scale ? 0 : (v - med) / scale);
}

// ---- MoM view from the heatmap's weighted mom_pct cells (SQL already does like-for-like) ----
function buildMoMView(heatmap) {
  const subset = heatmap?.tier_subsets?.[''] || {};
  const cells = subset['mom_pct|weighted']?.cells || [];
  if (!cells.length) return unavailable('MoM', 'Month', 'No monthly stage data yet.');

  const months = [...new Set(cells.map((c) => c.month))].sort();
  const latest = months[months.length - 1];
  const live = cells.filter((c) => c.month === latest && c.value != null && c.revenue != null);
  if (!live.length) return unavailable('MoM', 'Month', 'No monthly stage data yet.');

  const zOf = robustZ(live.map((c) => c.value));
  // Overall = revenue-weighted roll-up of the stage cells (prior derived from each stage's own MoM).
  let curT = 0;
  let priT = 0;
  for (const c of live) {
    curT += c.revenue;
    priT += c.revenue / (1 + c.value / 100);
  }
  const changePct = priT ? (curT - priT) / priT : null;
  const prevMonth = months[months.length - 2];

  const rows = live
    .map((c) => {
      const cp = c.value / 100;
      const cur = toBn(c.revenue);
      const pri = toBn(c.revenue / (1 + c.value / 100));
      const z = zOf(c.value);
      return {
        label: shortStage(c.bucket),
        thisValue: cur,
        lastValue: pri,
        changePct: cp,
        direction: directionOf(cp),
        bigMove: Math.abs(cp) >= MOM_BIG || Math.abs(z) >= Z_BIG,
        note: c.composition_changed ? 'members changed' : undefined,
      };
    })
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  const up = rows.filter((r) => r.direction === 'up').length;
  const down = rows.filter((r) => r.direction === 'down').length;
  const summary =
    changePct != null
      ? `Month-on-month revenue ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct * 100).toFixed(
          1
        )}% like-for-like (${monthLabel(prevMonth)} → ${monthLabel(latest)}) — ${up} of ${rows.length} supply-chain stages firmer, ${down} softer. Like-for-like compares only companies that filed both months, so late September filers don't distort the move.`
      : undefined;

  return {
    comparison: 'MoM',
    label: 'Month',
    available: changePct != null,
    thisPeriodLabel: monthLabel(latest),
    lastPeriodLabel: monthLabel(prevMonth),
    thisValue: toBn(curT),
    lastValue: toBn(priT),
    changePct,
    changeAbs: toBn(curT - priT),
    direction: directionOf(changePct),
    bigMove: changePct != null && Math.abs(changePct) >= MOM_BIG,
    breakdown: rows,
    summary,
    _latestMonth: latest,
    _liveCells: live,
    _zOf: zOf,
  };
}

// ---- QoQ view from analytics rows, like-for-like on companies present in all 3 months of both quarters ----
function buildQoQView(rows) {
  const quarters = [...new Set(rows.map((r) => qOf(r.month)).filter(Boolean))].sort();
  if (quarters.length < 2) return unavailable('QoQ', 'Quarter', 'Not enough history for a quarter comparison.');
  const thisQ = quarters[quarters.length - 1];
  const lastQ = quarters[quarters.length - 2];
  const tm = new Set(qMonths(thisQ));
  const lm = new Set(qMonths(lastQ));

  // Per company: revenue + set of reported months in each quarter.
  const byT = {};
  for (const r of rows) {
    if (r.revenue_twd_thousands == null) continue;
    const o = (byT[r.ticker] ??= { t: 0, l: 0, tm: new Set(), lm: new Set(), bucket: r.bucket });
    if (tm.has(r.month)) {
      o.t += r.revenue_twd_thousands;
      o.tm.add(r.month);
    }
    if (lm.has(r.month)) {
      o.l += r.revenue_twd_thousands;
      o.lm.add(r.month);
    }
  }
  // Like-for-like: company must have reported all three months in BOTH quarters.
  const keep = Object.values(byT).filter((o) => o.tm.size === 3 && o.lm.size === 3);
  if (!keep.length) return unavailable('QoQ', 'Quarter', 'No like-for-like cohort across the last two quarters.');

  const sum = (f) => keep.reduce((s, o) => s + f(o), 0);
  const curT = sum((o) => o.t);
  const priT = sum((o) => o.l);
  const changePct = priT ? (curT - priT) / priT : null;

  // The current quarter is "QTD" if its newest month has fewer reporters than its earlier months.
  const monthsThisQ = qMonths(thisQ);
  const reportersIn = (m) => rows.filter((r) => r.month === m && r.revenue_twd_thousands != null).length;
  const counts = monthsThisQ.map(reportersIn);
  const qtd = counts[2] > 0 && counts[2] < Math.max(counts[0], counts[1]);

  // Per-stage QoQ, like-for-like.
  const buckets = [...new Set(keep.map((o) => o.bucket).filter(Boolean))];
  const rowsOut = buckets
    .map((b) => {
      const inB = keep.filter((o) => o.bucket === b);
      const c = inB.reduce((s, o) => s + o.t, 0);
      const p = inB.reduce((s, o) => s + o.l, 0);
      const cp = p ? (c - p) / p : null;
      return {
        label: shortStage(b),
        thisValue: toBn(c),
        lastValue: toBn(p),
        changePct: cp,
        direction: directionOf(cp),
        bigMove: cp != null && Math.abs(cp) >= QOQ_BIG,
      };
    })
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  const summary =
    changePct != null
      ? `Quarter-on-quarter revenue ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct * 100).toFixed(1)}% (${quarterLabel(
          lastQ
        )} → ${quarterLabel(thisQ)}${qtd ? ', quarter-to-date' : ''}), like-for-like across ${keep.length} companies.${
          qtd ? ' The latest month is still filling in, so this quarter will firm up as remaining filings land.' : ''
        }`
      : undefined;

  return {
    comparison: 'QoQ',
    label: 'Quarter',
    available: changePct != null,
    thisPeriodLabel: quarterLabel(thisQ) + (qtd ? ' (QTD)' : ''),
    lastPeriodLabel: quarterLabel(lastQ),
    thisValue: toBn(curT),
    lastValue: toBn(priT),
    changePct,
    changeAbs: toBn(curT - priT),
    direction: directionOf(changePct),
    bigMove: changePct != null && Math.abs(changePct) >= QOQ_BIG,
    breakdown: rowsOut,
    summary,
  };
}

function unavailable(comparison, label, reason) {
  return {
    comparison,
    label,
    available: false,
    unavailableReason: reason,
    thisPeriodLabel: '—',
    lastPeriodLabel: '—',
    thisValue: null,
    lastValue: null,
    changePct: null,
    changeAbs: null,
    direction: 'flat',
    breakdown: [],
  };
}

// "Why it moved": the stage that diverges most from the pack (robust-z), plus the companies
// accelerating / decelerating hardest on a YoY basis in the latest month (the real drivers).
function buildInsights(momView, rows) {
  const out = [];
  const live = momView?._liveCells || [];
  const zOf = momView?._zOf || (() => 0);
  if (live.length) {
    const ranked = live
      .map((c) => ({ bucket: c.bucket, v: c.value, z: zOf(c.value) }))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const top = ranked[0];
    if (top && Math.abs(top.z) >= 1.2) {
      const others = ranked.filter((r) => r !== top && r.v != null);
      const peerMed = others.length ? [...others.map((r) => r.v)].sort((a, b) => a - b)[Math.floor(others.length / 2)] : 0;
      out.push({
        title: `${shortStage(top.bucket)} is the standout — ${top.v >= 0 ? '+' : ''}${top.v.toFixed(1)}% MoM`,
        body: `It moved ${top.v < peerMed ? 'against' : 'ahead of'} the rest of the supply chain (peers around ${
          peerMed >= 0 ? '+' : ''
        }${peerMed.toFixed(1)}%). Worth a look at whether this is a one-month timing effect or a genuine turn.`,
      });
    }
  }

  const latest = momView?._latestMonth;
  if (latest) {
    const acc = rows
      .filter((r) => r.month === latest && r.yoy_acceleration_ppt != null)
      .sort((a, b) => b.yoy_acceleration_ppt - a.yoy_acceleration_ppt);
    if (acc.length) {
      const fmt = (r) =>
        `${r.company_name} ${r.yoy_acceleration_ppt >= 0 ? '+' : ''}${r.yoy_acceleration_ppt.toFixed(0)}ppt (${shortStage(
          r.bucket
        )}, YoY ${r.yoy_pct != null ? `${r.yoy_pct.toFixed(0)}%` : 'n/a'})`;
      out.push({
        title: 'Who is accelerating vs fading',
        body: 'Year-on-year growth acceleration by company in the latest month — the names pulling each stage up or down.',
        bullets: [
          `Accelerating: ${acc.slice(0, 3).map(fmt).join('; ')}`,
          `Decelerating: ${acc.slice(-3).reverse().map(fmt).join('; ')}`,
        ],
        asOf: `${latest}-01`,
      });
    }
  }
  return out;
}

export async function connect(system) {
  const [heatmap, analytics] = await Promise.all([
    getJson(system.source.heatmap),
    getJson(system.source.url),
  ]);
  const rows = (Array.isArray(analytics?.rows) ? analytics.rows : []).filter((r) => !isWiwynn(r));
  if (!rows.length) throw new Error('analytics.json returned no rows');

  const momView = buildMoMView(heatmap);
  const qoqView = buildQoQView(rows);
  const views = [
    unavailable('WoW', 'Week', 'Taiwan issuers file revenue monthly — there is no weekly series.'),
    momView,
    qoqView,
  ];

  const def = momView.available ? momView : qoqView.available ? qoqView : views[1];
  const insights = buildInsights(momView, rows);
  const latestMonth = momView._latestMonth || [...new Set(rows.map((r) => r.month))].sort().pop();

  // strip internal scratch fields before emitting
  for (const v of views) {
    delete v._latestMonth;
    delete v._liveCells;
    delete v._zOf;
  }

  const block = makeBlock(system, {
    unit: 'TWD bn',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: def.changePct,
    direction: def.direction,
    asOf: `${latestMonth}-01`,
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      'TWSE/MOPS monthly filings, grouped by supply-chain stage. Headline & breakdown are like-for-like (only companies that filed both periods) so late filers don’t distort the move. Excludes Wiwynn (consolidated into Wistron). Monthly cadence — no weekly series.',
  });
  block.views = views;
  block.breakdownNoun = 'supply-chain stage';
  block.changeNoun = 'Revenue change';
  block.insights = insights;
  return block;
}
