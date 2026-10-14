// Schneider Electric — Graybar distributor pricing, like-for-like across two quarters (QoQ).
// Per slug: pick the latest capture in each of the two most recent quarters present, then
// compare the mean price over items priced in BOTH captures (require >=5 matched items).
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, currentQuarterId } from '../lib/quarters.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const SLUG_LABEL = { ups: 'UPS', 'rack-pdus': 'Rack PDUs', dcim: 'DCIM' };
const MIN_MATCHED = 5;

export async function connect(system) {
  const base = system.source.base;
  const slugs = Array.isArray(system.source.slugs) ? system.source.slugs : [];
  const perSlug = [];
  let newestCapture = null;
  let sourceUrl = system.dashboardUrl || '';

  for (const slug of slugs) {
    let data;
    try {
      data = await getJson(`${base}/${slug}.json`);
    } catch (e) {
      perSlug.push({ slug, error: true, reason: e instanceof Error ? e.message : String(e) });
      continue;
    }
    // Prefer the UPS search URL as the citeable source, else the first available.
    if (data?.search_url && (slug === 'ups' || !sourceUrl)) sourceUrl = data.search_url;

    const hist = (Array.isArray(data?.history) ? data.history : []).filter(
      (e) => e.captured_at && e.prices
    );
    const byQuarter = new Map();
    for (const e of hist) {
      if (!newestCapture || e.captured_at > newestCapture) newestCapture = e.captured_at;
      const qid = quarterOf(e.captured_at);
      const cur = byQuarter.get(qid);
      if (!cur || e.captured_at > cur.captured_at) byQuarter.set(qid, e);
    }
    const qids = [...byQuarter.keys()].sort().reverse();
    if (qids.length < 2) {
      perSlug.push({ slug, insufficient: true, reason: 'fewer than two quarters captured' });
      continue;
    }
    const [newQid, oldQid] = qids;
    const now = byQuarter.get(newQid).prices || {};
    const then = byQuarter.get(oldQid).prices || {};
    const matched = Object.keys(now).filter((k) => now[k] != null && then[k] != null);
    if (matched.length < MIN_MATCHED) {
      perSlug.push({ slug, insufficient: true, reason: `only ${matched.length} comparable items`, newQid, oldQid });
      continue;
    }
    const mean = (obj) => matched.reduce((s, k) => s + obj[k], 0) / matched.length;
    const nowMean = mean(now);
    const thenMean = mean(then);
    const slugPct = thenMean ? (nowMean - thenMean) / thenMean : null;
    perSlug.push({ slug, matched: matched.length, nowMean, thenMean, slugPct, newQid, oldQid });
  }

  const usable = perSlug.filter((s) => s.slugPct != null && Number.isFinite(s.slugPct));
  if (!usable.length) {
    throw new Error('no slug had >=5 comparable items across two quarters');
  }

  // Headline = matched-item-count-weighted mean of the slug changes.
  let wSum = 0;
  let wPct = 0;
  let wNow = 0;
  let wThen = 0;
  for (const s of usable) {
    wSum += s.matched;
    wPct += s.slugPct * s.matched;
    wNow += s.nowMean * s.matched;
    wThen += s.thenMean * s.matched;
  }
  const changePct = wSum ? wPct / wSum : null;
  const thisValue = wSum ? wNow / wSum : null;
  const lastValue = wSum ? wThen / wSum : null;

  const newQid = usable[0].newQid;
  const oldQid = usable[0].oldQid;
  const curQ = currentQuarterId();

  const breakdown = perSlug.map((s) => {
    const label = SLUG_LABEL[s.slug] || s.slug;
    if (s.insufficient || s.error) {
      return { label, thisValue: null, lastValue: null, changePct: null, direction: 'flat' };
    }
    return {
      label,
      thisValue: s.nowMean,
      lastValue: s.thenMean,
      changePct: s.slugPct,
      direction: directionOf(s.slugPct),
    };
  });

  const excluded = perSlug
    .filter((s) => s.insufficient || s.error)
    .map((s) => SLUG_LABEL[s.slug] || s.slug);
  let notes = 'Like-for-like: mean over items priced in both quarters, only priced categories.';
  if (excluded.length) notes += ` Excluded from headline (too few comparable items): ${excluded.join(', ')}.`;

  return makeBlock(system, {
    unit: '$',
    comparison: 'QoQ',
    thisPeriodLabel: `${quarterLabel(newQid)}${newQid === curQ ? ' (QTD)' : ''}`,
    lastPeriodLabel: quarterLabel(oldQid),
    thisValue,
    lastValue,
    changePct,
    direction: directionOf(changePct),
    asOf: newestCapture || new Date().toISOString(),
    breakdown,
    sourceUrl,
    notes,
  });
}
