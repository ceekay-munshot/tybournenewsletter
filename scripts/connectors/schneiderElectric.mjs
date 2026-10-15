// Schneider Electric — Graybar distributor pricing across SIX data-centre product
// lines, like-for-like, at THREE windows (Weekly / MoM / QoQ). Each window compares
// a category's latest PRICED capture to the nearest earlier capture in-window, using
// only items priced in BOTH (immune to catalogue churn), and splits each category by
// parent brand (Schneider / Eaton / Vertiv / …). Emits a multi-period block (`views[]`)
// plus a default MoM headline so the overview keeps working.
//
// Honest about the messy bits: an empty latest capture is skipped (we fall back to the
// last capture that actually had prices); a category with too few priced items is shown
// but flagged "thin" and kept OUT of the headline; a category priced only to an old date
// is stamped with that date.
import { getJson } from '../lib/http.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const DAY = 864e5;
const MIN_MATCHED = 5; // a category needs >= this many items priced in both captures to count toward the headline
const MIN_BRAND = 3; // min items for a parent-brand sub-row to be shown
const BIG_MOVE = 0.02; // |change| >= 2% flags a big move (tunable alert threshold)
const STALE_DAYS = 10; // a category priced only to >this many days before the newest capture is stamped

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

const PERIODS = [
  { comparison: 'WoW', label: 'Week', days: 7 },
  { comparison: 'MoM', label: 'Month', days: 30 },
  { comparison: 'QoQ', label: 'Quarter', days: 91 },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** Compare a category's latest PRICED capture to the nearest earlier capture inside the
 *  window [0.5×, 2×] days that has usable overlap. Like-for-like over shared items. */
function compareCat(history, days) {
  // only captures that actually carry a price map
  const hist = (Array.isArray(history) ? history : []).filter(
    (e) => e && e.captured_at && e.prices && Object.keys(e.prices).length
  );
  if (hist.length < 2) return { active: false };
  const latest = hist[hist.length - 1];
  const tLatest = new Date(latest.captured_at).getTime();
  const now = latest.prices;
  const lo = 0.5 * days * DAY;
  const hi = 2 * days * DAY;

  const cands = [];
  for (const h of hist.slice(0, -1)) {
    const gap = tLatest - new Date(h.captured_at).getTime();
    if (gap < lo || gap > hi) continue;
    const matched = Object.keys(now).filter((k) => typeof h.prices[k] === 'number').length;
    if (matched >= 1) cands.push({ h, matched, dist: Math.abs(gap - days * DAY) });
  }
  if (!cands.length) return { active: false };
  // prefer captures with enough overlap, then nearest to the target gap (keeps the window honest)
  const healthy = cands.filter((c) => c.matched >= MIN_MATCHED);
  const pool = (healthy.length ? healthy : cands).sort((a, b) => a.dist - b.dist);
  const base = pool[0].h;

  const then = base.prices;
  const keys = Object.keys(now).filter((k) => typeof then[k] === 'number');
  if (!keys.length) return { active: false };

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

export async function connect(system) {
  const base = system.source.base;
  const slugs =
    Array.isArray(system.source.slugs) && system.source.slugs.length ? system.source.slugs : CATS.map((c) => c.slug);
  const labelOf = Object.fromEntries(CATS.map((c) => [c.slug, c.label]));

  const data = {};
  let newestCapture = null;
  let sourceUrl = system.dashboardUrl || '';
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        const d = await getJson(`${base}/${slug}.json`);
        data[slug] = d;
        if (d?.search_url && (slug === 'ups' || !sourceUrl)) sourceUrl = d.search_url;
        for (const e of Array.isArray(d?.history) ? d.history : []) {
          if (e?.captured_at && e.prices && Object.keys(e.prices).length && (!newestCapture || e.captured_at > newestCapture)) {
            newestCapture = e.captured_at;
          }
        }
      } catch {
        data[slug] = null;
      }
    })
  );

  if (!Object.values(data).some(Boolean)) throw new Error('no Schneider category data could be fetched');
  const tNewest = newestCapture ? new Date(newestCapture).getTime() : Date.now();

  const views = PERIODS.map(({ comparison, label, days }) => {
    const rows = [];
    let wSum = 0;
    let wPct = 0;
    let wNow = 0;
    let wThen = 0;
    let primaryBase = null;
    let primaryMatched = -1;

    for (const slug of slugs) {
      const d = data[slug];
      const lbl = labelOf[slug] || slug;
      const r = d ? compareCat(d.history, days) : { active: false };
      if (!r.active) {
        rows.push({
          label: lbl,
          thisValue: null,
          lastValue: null,
          changePct: null,
          direction: 'flat',
          note: d ? 'no comparable price in this window' : 'could not load',
        });
        continue;
      }
      const staleDays = (tNewest - new Date(r.latestDate).getTime()) / DAY;
      const noteParts = [];
      if (r.thin) noteParts.push(`only ${r.matched} priced item${r.matched === 1 ? '' : 's'}`);
      if (staleDays > STALE_DAYS) noteParts.push(`priced to ${fmtShort(r.latestDate)}`);
      rows.push({
        label: lbl,
        thisValue: r.nowMean,
        lastValue: r.thenMean,
        changePct: r.changePct,
        direction: directionOf(r.changePct),
        bigMove: r.changePct != null && Math.abs(r.changePct) >= BIG_MOVE,
        sub: r.brands,
        note: noteParts.length ? noteParts.join(' · ') : undefined,
      });
      // headline weighting: only solid categories — enough matched items AND fresh
      // (no thin/stale caveat). Keeps the blended "this period" number honest.
      if (r.changePct != null && noteParts.length === 0) {
        wSum += r.matched;
        wPct += r.changePct * r.matched;
        wNow += r.nowMean * r.matched;
        wThen += r.thenMean * r.matched;
        if (r.matched > primaryMatched) {
          primaryMatched = r.matched;
          primaryBase = r.baseDate;
        }
      }
    }

    // honest "not tracked" rows for the software/service lines Graybar doesn't carry
    for (const u of UNAVAILABLE) {
      rows.push({ label: u.label, thisValue: null, lastValue: null, changePct: null, direction: 'flat', note: u.note });
    }

    const active = wSum > 0;
    const changePct = active ? wPct / wSum : null;
    const thisValue = active ? wNow / wSum : null;
    const lastValue = active ? wThen / wSum : null;
    const bigMove = changePct != null && Math.abs(changePct) >= BIG_MOVE;
    const solidCount = rows.filter((x) => x.changePct != null && !x.note).length;
    const movedCount = rows.filter((x) => x.bigMove).length;
    const summary = active
      ? `${label}-on-${label.toLowerCase()} like-for-like price ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(
          changePct * 100
        ).toFixed(1)}% across ${solidCount} solidly-priced categor${solidCount === 1 ? 'y' : 'ies'}${
          movedCount ? `; ${movedCount} moved more than ${BIG_MOVE * 100}%` : ''
        }.`
      : undefined;

    return {
      comparison,
      label,
      available: active,
      unavailableReason: active ? undefined : 'Not enough comparable pricing captured for this window yet.',
      thisPeriodLabel: newestCapture ? fmtShort(newestCapture) : '—',
      lastPeriodLabel: primaryBase ? fmtShort(primaryBase) : '—',
      thisValue,
      lastValue,
      changePct,
      changeAbs: thisValue != null && lastValue != null ? thisValue - lastValue : null,
      direction: directionOf(changePct),
      bigMove,
      breakdown: rows,
      summary,
    };
  });

  const def = views.find((v) => v.comparison === 'MoM' && v.available) || views.find((v) => v.available) || views[1];

  const excluded = slugs.filter((s) => !data[s]).map((s) => labelOf[s] || s);
  let notes =
    'Graybar distributor list price, like-for-like (only items priced in both captures). Six data-centre product lines, split by parent brand. Weekly/monthly/quarterly compares each category’s latest priced capture to the nearest earlier capture in that window.';
  notes += ` ${UNAVAILABLE.length} software/service lines are sold direct (not via Graybar), so they carry no price.`;
  if (excluded.length) notes += ` Could not fetch: ${excluded.join(', ')}.`;

  const block = makeBlock(system, {
    unit: '$',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: def.changePct,
    direction: def.direction,
    asOf: newestCapture || new Date().toISOString(),
    breakdown: def.breakdown,
    summary: def.summary,
    sourceUrl,
    notes,
  });
  block.views = views;
  return block;
}
