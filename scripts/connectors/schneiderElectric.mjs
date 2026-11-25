// Schneider Electric — Graybar distributor pricing across SIX data-centre product
// lines, like-for-like, by CALENDAR period (Week / Month / Quarter). Each period's level is
// a category's last priced capture inside that period, compared to its last priced capture
// in the period before, using only items priced in BOTH (immune to catalogue churn), and
// split by parent brand (Schneider / Eaton / Vertiv / …). Emits a multi-period block
// (`views[]`) plus a default Month headline so the overview keeps working.
//
// Every view's columns run to the CURRENT calendar period, labelled to date
// ("wk 23 Nov (WTD)", "Nov '26 (MTD)", "Q4 '26 (QTD)"). A period with no priced capture
// stays blank — never filled forward — and the row says when the category was last priced.
//
// Honest about the messy bits: a partial capture (far fewer priced items than the period's
// best) is skipped in favour of a full one; a category with too few priced items is shown
// but flagged "thin" and kept OUT of the headline; when the Graybar capture is failing the
// notes say so, read from the source's own health files.
import { getJson } from '../lib/http.mjs';
import { makeBlock, directionOf, attachPrev } from '../lib/changeBlock.mjs';

const DAY = 864e5;
const MIN_MATCHED = 5; // a category needs >= this many items priced in both captures to count toward the headline
const MIN_BRAND = 3; // min items for a parent-brand sub-row to be shown
const BIG_MOVE = 0.02; // |change| >= 2% flags a big move (tunable alert threshold)
const PARTIAL_SHARE = 0.5; // a capture with < this share of the period's best priced count is a partial capture

const CATS = [
  { slug: 'ups', label: 'UPS' },
  { slug: 'busway', label: 'Busway / Power Distribution' },
  { slug: 'rack-pdus', label: 'Rack PDUs' },
  { slug: 'rack-systems', label: 'Rack Systems' },
  { slug: 'pod-modular', label: 'Pod & Modular' },
  { slug: 'dcim', label: 'DCIM Software' },
];

// Software / service lines Graybar does not distribute — shown honestly, never faked.
const UNAVAILABLE = [
  { label: 'Liquid Cooling (Motivair)', note: 'Sold direct — not distributed by Graybar' },
  { label: 'Reference Designs & Integration', note: 'An engineering service — no catalogue price' },
  { label: 'Sustainability & Energy Mgmt', note: 'SaaS / advisory sold direct by Schneider' },
];

// n = columns shown; lookback = how many periods back we search for the last priced one.
const PERIODS = [
  { comparison: 'WoW', label: 'Week', n: 4, lookback: 30, toDate: 'WTD' },
  { comparison: 'MoM', label: 'Month', n: 4, lookback: 12, toDate: 'MTD' },
  { comparison: 'QoQ', label: 'Quarter', n: 3, lookback: 6, toDate: 'QTD' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// ---- calendar periods (UTC; weeks start Monday) ---------------------------------------

/** Start (ms) of the calendar period containing t. */
export function periodStart(comparison, t) {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (comparison === 'MoM') return Date.UTC(y, m, 1);
  if (comparison === 'QoQ') return Date.UTC(y, m - (m % 3), 1);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return Date.UTC(y, m, d.getUTCDate()) - dow * DAY;
}

/** Start (ms) of the period k periods after (k<0: before) the one starting at `start`. */
export function shiftPeriod(comparison, start, k) {
  if (comparison === 'WoW') return start + k * 7 * DAY;
  const d = new Date(start);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k * (comparison === 'MoM' ? 1 : 3), 1);
}

export function periodLabel(comparison, start, isCurrent = false) {
  const d = new Date(start);
  const yy = String(d.getUTCFullYear()).slice(2);
  let s;
  if (comparison === 'WoW') s = `wk ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  else if (comparison === 'MoM') s = `${MONTHS[d.getUTCMonth()]} '${yy}`;
  else s = `Q${Math.floor(d.getUTCMonth() / 3) + 1} '${yy}`;
  if (!isCurrent) return s;
  return `${s} (${PERIODS.find((p) => p.comparison === comparison)?.toDate ?? 'TD'})`;
}

// ---- per-category comparison -----------------------------------------------------------

/** The capture that stands for [lo, hi): the latest one inside it that isn't a partial
 *  capture (fewer than PARTIAL_SHARE of the period's best priced count). */
function pickCapture(hist, lo, hi) {
  const inP = hist.filter((e) => e.t >= lo && e.t < hi);
  if (!inP.length) return null;
  const best = Math.max(...inP.map((e) => e.n));
  const full = inP.filter((e) => e.n >= PARTIAL_SHARE * best);
  return full[full.length - 1];
}

/** Like-for-like comparison of a category's capture in the period starting `start` against
 *  its capture in the period before. `reason` explains an inactive result. */
function comparePeriod(hist, comparison, start) {
  const latest = pickCapture(hist, start, shiftPeriod(comparison, start, 1));
  if (!latest) return { active: false, reason: 'none' };
  const base = pickCapture(hist, shiftPeriod(comparison, start, -1), start);
  if (!base) return { active: false, reason: 'nobase', latestDate: latest.captured_at };

  const now = latest.prices;
  const then = base.prices;
  const keys = Object.keys(now).filter((k) => typeof now[k] === 'number' && typeof then[k] === 'number');
  if (!keys.length) return { active: false, reason: 'nooverlap', latestDate: latest.captured_at };

  const mean = (obj, ks) => ks.reduce((s, k) => s + obj[k], 0) / ks.length;
  const nowMean = mean(now, keys);
  const thenMean = mean(then, keys);
  const changePct = thenMean ? (nowMean - thenMean) / thenMean : null;

  // parent-brand split (brand_of already maps item -> parent company in the data)
  const bo = latest.brand_of || base.brand_of || {};
  const groups = {};
  for (const k of keys) {
    const co = bo[k] || (base.brand_of && base.brand_of[k]) || 'Other';
    (groups[co] ||= []).push(k);
  }
  const brands = Object.entries(groups)
    .filter(([, ks]) => ks.length >= MIN_BRAND)
    .map(([co, ks]) => {
      const nm = mean(now, ks);
      const tm = mean(then, ks);
      const cp = tm ? (nm - tm) / tm : null;
      return {
        label: co,
        thisValue: nm,
        lastValue: tm,
        changePct: cp,
        direction: directionOf(cp),
        bigMove: cp != null && Math.abs(cp) >= BIG_MOVE,
      };
    })
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  return {
    active: true,
    matched: keys.length,
    thin: keys.length < MIN_MATCHED,
    nowMean,
    thenMean,
    changePct,
    brands,
    baseDate: base.captured_at,
    latestDate: latest.captured_at,
  };
}

/** One calendar period as a full view: a row per product line (with brand subs) plus the
 *  honest "not tracked" lines, and a headline blended over the solid categories only. */
function buildPeriodView(ctx, comparison, label, start) {
  const isCurrent = start === ctx.current[comparison];
  const thisLabel = periodLabel(comparison, start, isCurrent);
  const lastLabel = periodLabel(comparison, shiftPeriod(comparison, start, -1));
  const rows = [];
  let anyActive = false;
  let wSum = 0;
  let wPct = 0;
  let wNow = 0;
  let wThen = 0;
  let solid = 0;

  for (const slug of ctx.slugs) {
    const lbl = ctx.labelOf[slug] || slug;
    const hist = ctx.hist[slug];
    if (!hist) {
      rows.push({ label: lbl, thisValue: null, lastValue: null, changePct: null, direction: 'flat', note: 'could not load' });
      continue;
    }
    const r = comparePeriod(hist, comparison, start);
    if (!r.active) {
      const note =
        r.reason === 'none'
          ? `no price captured in ${thisLabel}`
          : r.reason === 'nobase'
            ? `no ${lastLabel} capture to compare`
            : 'no items priced in both periods';
      rows.push({ label: lbl, thisValue: null, lastValue: null, changePct: null, direction: 'flat', note, _inactive: r.reason });
      continue;
    }
    anyActive = true;
    rows.push({
      label: lbl,
      thisValue: r.nowMean,
      lastValue: r.thenMean,
      changePct: r.changePct,
      direction: directionOf(r.changePct),
      bigMove: r.changePct != null && Math.abs(r.changePct) >= BIG_MOVE,
      sub: r.brands,
      note: r.thin ? `only ${r.matched} priced item${r.matched === 1 ? '' : 's'}` : undefined,
    });
    // headline weighting: only solid categories (enough matched items)
    if (r.changePct != null && !r.thin) {
      solid++;
      wSum += r.matched;
      wPct += r.changePct * r.matched;
      wNow += r.nowMean * r.matched;
      wThen += r.thenMean * r.matched;
    }
  }

  for (const u of UNAVAILABLE) {
    rows.push({ label: u.label, thisValue: null, lastValue: null, changePct: null, direction: 'flat', note: u.note });
  }

  const active = wSum > 0;
  const changePct = active ? wPct / wSum : null;
  const thisValue = active ? wNow / wSum : null;
  const lastValue = active ? wThen / wSum : null;
  return {
    comparison,
    label,
    available: active,
    thisPeriodLabel: thisLabel,
    lastPeriodLabel: lastLabel,
    thisValue,
    lastValue,
    changePct,
    changeAbs: thisValue != null && lastValue != null ? thisValue - lastValue : null,
    direction: directionOf(changePct),
    bigMove: changePct != null && Math.abs(changePct) >= BIG_MOVE,
    breakdown: rows,
    _start: start,
    _anyActive: anyActive,
    _solid: solid,
  };
}

// ---- series (oldest -> newest columns) --------------------------------------------------

/** A like-for-like level only belongs in the series if it CHAINS to the next period via that
 *  period's change (baskets shift between captures). Anchor on the newest non-empty value
 *  — trailing empty periods (no capture yet) don't break the chain, they're just blank — and
 *  null any older value that doesn't chain (or sits before an interior gap). */
function reconcile(series) {
  let anchor = -1;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].value != null) {
      anchor = i;
      break;
    }
  }
  for (let i = anchor - 1; i >= 0; i--) {
    const cur = series[i];
    const next = series[i + 1];
    if (cur.value == null) continue;
    if (next.value == null || next.changePct == null || cur.value === 0) {
      cur.value = null;
      continue;
    }
    if (Math.abs(next.value - cur.value * (1 + next.changePct)) > Math.abs(next.value) * 0.015 + 1e-9) cur.value = null;
  }
  return series;
}

const point = (label, src) => ({
  label,
  value: src ? src.thisValue ?? null : null,
  changePct: src ? src.changePct ?? null : null,
  changeAbs: src ? src.changeAbs ?? null : null,
  direction: src ? src.direction ?? directionOf(src.changePct ?? null) : 'flat',
});

/** Put the columns' series onto `view` (headline), each breakdown row and each brand sub.
 *  Unlike the shared attachSeries this keeps empty columns, so the table always reaches the
 *  current period. */
function attachCalendarSeries(view, cols) {
  view.series = reconcile(cols.map((c) => point(c.thisPeriodLabel, c.available ? c : null)));
  for (const r of view.breakdown) {
    const rowIn = (c) => c.breakdown.find((x) => x.label === r.label);
    r.series = reconcile(cols.map((c) => point(c.thisPeriodLabel, rowIn(c))));
    for (const s of r.sub || []) {
      s.series = reconcile(cols.map((c) => point(c.thisPeriodLabel, rowIn(c)?.sub?.find((y) => y.label === s.label))));
    }
  }
}

// ---- connector --------------------------------------------------------------------------

const strip = (v) => {
  delete v._start;
  delete v._anyActive;
  delete v._solid;
  for (const r of v.breakdown) delete r._inactive;
  return v;
};

export async function connect(system, { now = Date.now() } = {}) {
  const base = system.source.base;
  const slugs =
    Array.isArray(system.source.slugs) && system.source.slugs.length ? system.source.slugs : CATS.map((c) => c.slug);
  const labelOf = Object.fromEntries(CATS.map((c) => [c.slug, c.label]));

  const data = {};
  const health = {};
  let sourceUrl = system.dashboardUrl || '';
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        const d = await getJson(`${base}/${slug}.json`);
        data[slug] = d;
        if (d?.search_url && (slug === 'ups' || !sourceUrl)) sourceUrl = d.search_url;
      } catch {
        data[slug] = null;
      }
      try {
        health[slug] = await getJson(`${base}/${slug}-health.json`, { retries: 1 });
      } catch {
        health[slug] = null; // optional — only used to explain a gap
      }
    })
  );
  if (!Object.values(data).some(Boolean)) throw new Error('no Schneider category data could be fetched');

  // priced captures only, oldest -> newest, with a parsed time + priced count
  const hist = {};
  const lastPriced = {};
  let newestCapture = null;
  for (const slug of slugs) {
    const d = data[slug];
    if (!d) continue;
    hist[slug] = (Array.isArray(d.history) ? d.history : [])
      .filter((e) => e && e.captured_at && e.prices && Object.keys(e.prices).length)
      .map((e) => ({ ...e, t: new Date(e.captured_at).getTime(), n: Object.keys(e.prices).length }))
      .filter((e) => Number.isFinite(e.t))
      .sort((a, b) => a.t - b.t);
    const last = hist[slug][hist[slug].length - 1];
    if (last) {
      lastPriced[slug] = last.captured_at;
      if (!newestCapture || last.captured_at > newestCapture) newestCapture = last.captured_at;
    }
  }

  const current = Object.fromEntries(PERIODS.map((p) => [p.comparison, periodStart(p.comparison, now)]));
  const ctx = { slugs, labelOf, hist, current };

  const views = PERIODS.map(({ comparison, label, n, lookback }) => {
    const cache = new Map();
    const at = (start) => {
      if (!cache.has(start)) cache.set(start, buildPeriodView(ctx, comparison, label, start));
      return cache.get(start);
    };
    const cur = current[comparison];

    // newest period with any priced row (where the columns end before the to-date one), and
    // newest period with a solid blended headline
    let lastData = null;
    let head = null;
    for (let k = 0; k <= lookback && !(lastData && head); k++) {
      const v = at(shiftPeriod(comparison, cur, -k));
      if (!lastData && v._anyActive) lastData = v;
      if (!head && v.available) head = v;
    }
    if (!head) {
      return strip({
        ...at(cur),
        available: false,
        unavailableReason: 'Not enough comparable pricing captured for this window yet.',
      });
    }

    // columns: contiguous periods ending at the last priced one, then the current period
    // (to date) if no capture has landed in it — the jump shows in the column header.
    const endData = lastData._start;
    const nData = endData === cur ? n : n - 1;
    const cols = [];
    for (let k = nData - 1; k >= 0; k--) cols.push(at(shiftPeriod(comparison, endData, -k)));
    if (endData !== cur) cols.push(at(cur));
    while (cols.length > 2 && !cols[0]._anyActive) cols.shift();

    // the headline view = the newest solid period, with the period before it as the prior step
    const view = { ...head, breakdown: head.breakdown.map((r) => ({ ...r, sub: r.sub?.map((s) => ({ ...s })) })) };
    const prior = at(shiftPeriod(comparison, head._start, -1));
    if (prior.available) {
      view.prevLabel = prior.lastPeriodLabel;
      view.prevValue = prior.lastValue;
      view.prevChangePct = prior.changePct;
      view.prevDirection = directionOf(prior.changePct);
      attachPrev(view.breakdown, prior.breakdown);
    }
    attachCalendarSeries(view, cols);

    // say when a line was last priced if it has nothing in the current period
    const curView = at(cur);
    const curLabel = periodLabel(comparison, cur, true);
    for (const r of view.breakdown) {
      const slug = slugs.find((s) => (labelOf[s] || s) === r.label);
      if (!slug || !hist[slug]) continue;
      const cr = curView.breakdown.find((x) => x.label === r.label);
      if (cr && cr._inactive === 'none' && lastPriced[slug]) {
        const since = `no Graybar price since ${fmtShort(lastPriced[slug])}`;
        r.note = r._inactive ? since : [r.note, since].filter(Boolean).join(' · ');
      }
      delete r._inactive;
    }

    const solidCount = head._solid;
    const movedCount = view.breakdown.filter((x) => x.bigMove).length;
    let summary = `${label}-on-${label.toLowerCase()} like-for-like price ${view.changePct >= 0 ? 'up' : 'down'} ${Math.abs(
      view.changePct * 100
    ).toFixed(1)}% (${view.lastPeriodLabel} → ${view.thisPeriodLabel}) across ${solidCount} solidly-priced categor${
      solidCount === 1 ? 'y' : 'ies'
    }${movedCount ? `; ${movedCount} moved more than ${BIG_MOVE * 100}%` : ''}.`;
    if (!curView._anyActive && newestCapture) {
      summary += ` No Graybar price has been captured since ${fmtShort(newestCapture)}, so ${curLabel} is blank until captures resume.`;
    }
    view.summary = summary;
    return strip(view);
  });

  const def = views.find((v) => v.comparison === 'MoM' && v.available) || views.find((v) => v.available) || views[1];

  const excluded = slugs.filter((s) => !data[s]).map((s) => labelOf[s] || s);
  let notes =
    'Graybar distributor list price, like-for-like (only items priced in both captures). Six data-centre product lines, split by parent brand. Each calendar week / month / quarter takes a category’s last priced capture in that period and compares it to its last priced capture in the period before; the current period is to date.';
  notes += ` ${UNAVAILABLE.length} software/service lines are sold direct (not via Graybar), so they carry no price.`;
  if (excluded.length) notes += ` Could not fetch: ${excluded.join(', ')}.`;
  // explain a capture outage from the source's own health files (clears itself once captures resume)
  const failing = slugs.filter((s) => health[s]?.last_attempt_status === 'failed' && (health[s]?.consecutive_failures ?? 0) >= 2);
  if (failing.length && newestCapture && now - new Date(newestCapture).getTime() > 7 * DAY) {
    const noPrices = failing.some((s) => /account_sees_no_prices/.test(health[s]?.hint || ''));
    notes += ` Graybar capture failing since ${fmtShort(newestCapture)} (${failing.length} of ${slugs.length} lines${
      noPrices ? ': logged in, but the account is shown no prices' : ''
    }); periods after that are blank, never filled forward.`;
  }

  const block = makeBlock(system, {
    unit: '$',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: def.changePct,
    direction: def.direction,
    asOf: newestCapture || new Date(now).toISOString(),
    breakdown: def.breakdown,
    summary: def.summary,
    sourceUrl,
    notes,
  });
  block.views = views;
  block.breakdownNoun = 'product line';
  block.subNoun = 'brand';
  block.changeNoun = 'Price change';
  return block;
}
