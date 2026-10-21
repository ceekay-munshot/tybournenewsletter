// AI Model Intelligence — OpenRouter model-token volume AND provider share, at three
// windows (Weekly / MoM / QoQ, default MoM). The headline is total routed tokens (the
// market is growing fast); the breakdown is each provider's token volume with its share
// shift alongside — the "volume + share" view. This is the honest fix for the old
// "Gemini went to zero" read: Google's tokens didn't vanish, its SHARE fell as the pie
// tripled, and on consumer app downloads / Alphabet results Google is still strong — all
// surfaced in "Why it moved".
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, monthOf, monthLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange, attachPrev, attachSeries } from '../lib/changeBlock.mjs';

const PROV_LABEL = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google (Gemini)',
  deepseek: 'DeepSeek',
  'x-ai': 'xAI',
  xai: 'xAI',
  'z-ai': 'Z.ai',
  stepfun: 'StepFun',
  xiaomi: 'Xiaomi',
  tencent: 'Tencent',
  nvidia: 'Nvidia',
  'meta-llama': 'Meta (Llama)',
  meta: 'Meta',
  mistralai: 'Mistral',
  qwen: 'Qwen (Alibaba)',
  moonshotai: 'Moonshot (Kimi)',
  minimax: 'MiniMax',
  microsoft: 'Microsoft',
  'arcee-ai': 'Arcee',
  nousresearch: 'Nous',
  tngtech: 'TNG',
  openrouter: 'OpenRouter',
  poolside: 'Poolside',
  stealth: 'Stealth / cloaked',
  others: 'Others',
};
const plabel = (p) => PROV_LABEL[p] || p;
const T = (n) => (n == null ? '—' : `${(n / 1e12).toFixed(1)}T`);
const VOL_BIG = 0.25; // a >=25% monthly token swing is a big move
const PP_BIG = 1.5; // or a >=1.5pp share shift

const provEntries = (w) => {
  const pv = w.providers;
  if (Array.isArray(pv)) return pv.map((e) => (Array.isArray(e) ? e : [e.name, e.value]));
  if (pv && typeof pv === 'object') return Object.entries(pv);
  return [];
};

// Group weeks into period buckets. Each bucket carries total, week count, per-provider
// tokens and per-provider week count (so we only trust a provider that's broken out
// across enough of the period — otherwise it hides in "others" and would read as ±∞).
function bucketWeeks(weeks, keyFn) {
  const b = {};
  for (const w of weeks) {
    const k = keyFn(w);
    if (!k) continue;
    const e = (b[k] ??= { total: 0, weeks: 0, prov: {}, provWeeks: {} });
    e.total += w.totalRaw || 0;
    e.weeks += 1;
    for (const [name, val] of provEntries(w)) {
      e.prov[name] = (e.prov[name] || 0) + (val || 0);
      e.provWeeks[name] = (e.provWeeks[name] || 0) + 1;
    }
  }
  return b;
}

function buildView(buckets, thisKey, lastKey, comparison, label, thisLabel, lastLabel) {
  if (!thisKey || !lastKey || !buckets[thisKey] || !buckets[lastKey]) {
    return unavailable(comparison, label, 'Not enough complete periods for this window yet.');
  }
  const tB = buckets[thisKey];
  const lB = buckets[lastKey];
  const changePct = pctChange(tB.total, lB.total);
  const minEach = Math.max(1, Math.floor(Math.min(tB.weeks, lB.weeks) / 2));

  // providers broken out across enough weeks of BOTH periods are "tracked"; the rest
  // (plus the feed's own "others") fold into a single Others row so totals stay honest.
  const names = new Set([...Object.keys(tB.prov), ...Object.keys(lB.prov)]);
  names.delete('others');
  const tracked = [...names].filter(
    (p) => (tB.provWeeks[p] || 0) >= minEach && (lB.provWeeks[p] || 0) >= minEach && (tB.prov[p] || 0) > 0 && (lB.prov[p] || 0) > 0
  );

  let tTrack = 0;
  let lTrack = 0;
  const rows = tracked.map((p) => {
    const tv = tB.prov[p] || 0;
    const lv = lB.prov[p] || 0;
    tTrack += tv;
    lTrack += lv;
    return provRow(p, tv, lv, tB.total, lB.total);
  });
  // Others = whatever the tracked providers don't cover (includes feed "others" + flippers).
  const tOther = Math.max(0, tB.total - tTrack);
  const lOther = Math.max(0, lB.total - lTrack);
  if (tOther > 0 || lOther > 0) rows.push(provRow('others', tOther, lOther, tB.total, lB.total));
  rows.sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const gainers = rows.filter((r) => r.direction === 'up' && r.label !== 'Others').length;
  const fallers = rows.filter((r) => r.direction === 'down' && r.label !== 'Others').length;
  const summary =
    changePct != null
      ? `${cap(label)}-on-${label.toLowerCase()} routed tokens ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(
          changePct * 100
        ).toFixed(1)}% to ${T(tB.total)} (${lastLabel} → ${thisLabel}) — ${gainers} providers grew volume, ${fallers} shrank, and share shifted toward lower-cost open-weight models.`
      : undefined;

  return {
    comparison,
    label,
    available: changePct != null,
    thisPeriodLabel: thisLabel,
    lastPeriodLabel: lastLabel,
    thisValue: tB.total,
    lastValue: lB.total,
    changePct,
    direction: directionOf(changePct),
    bigMove: changePct != null && Math.abs(changePct) >= 0.3,
    breakdown: rows,
    summary,
  };
}

// Attach the prior comparison (one bucket further back) so the headline + table show two
// consecutive periods of trend. The latest view used keys[last] vs keys[last-1]; the prior
// view is keys[last-1] vs keys[last-2], built the SAME way, then merged onto the latest by
// label. Left unset when there's no third complete bucket yet (honest: not enough history).
function attachPrior(latest, buckets, keys, comparison, label, labelFn) {
  if (!latest.available || !Array.isArray(keys) || keys.length < 3) return;
  const lastKey = keys[keys.length - 2];
  const prevKey = keys[keys.length - 3];
  const prior = buildView(buckets, lastKey, prevKey, comparison, label, labelFn(lastKey), labelFn(prevKey));
  if (!prior.available) return;
  // "Others" is a residual whose membership shifts between period-pairs (the tracked-provider
  // set differs), so its level doesn't chain cleanly. Exclude it from the merge: only
  // consistently-tracked providers get a prior comparison, and the latest Others row is left
  // without prev* — honest, since there is no comparable prior residual. The headline uses
  // the bucket TOTAL (not a residual), so it still chains correctly.
  attachPrev(latest.breakdown, prior.breakdown.filter((r) => r.label !== plabel('others')));
  latest.prevLabel = prior.lastPeriodLabel;
  latest.prevValue = prior.lastValue;
  latest.prevChangePct = prior.changePct;
  latest.prevChangeAbs = prior.changeAbs;
  latest.prevDirection = prior.direction;
}

// Build the last-N period-views NEWEST-FIRST (view k = keys[last-k] vs keys[last-k-1]) so the
// table can show one column per period. Reuses buildView, so each column is the SAME shape as
// the live view (full breakdown with volume + share). attachSeries matches rows across periods
// by label (so the shifting-membership "Others" row simply carries points only where it exists)
// and no-ops below 2 available views. `keys` are oldest->first, as the existing code sorts them.
function seriesViews(buckets, keys, comparison, label, labelFn, n) {
  const vs = [];
  for (let k = 0; k < n; k++) {
    const ti = keys.length - 1 - k;
    const li = ti - 1;
    if (li < 0) break;
    vs.push(buildView(buckets, keys[ti], keys[li], comparison, label, labelFn(keys[ti]), labelFn(keys[li])));
  }
  return vs;
}

function provRow(p, tv, lv, tTotal, lTotal) {
  const volc = pctChange(tv, lv);
  const ts = tTotal ? (tv / tTotal) * 100 : null;
  const ls = lTotal ? (lv / lTotal) * 100 : null;
  const pp = ts != null && ls != null ? ts - ls : null;
  const note =
    ts != null && ls != null
      ? `share ${ls.toFixed(1)}% → ${ts.toFixed(1)}% (${pp >= 0 ? '+' : ''}${pp.toFixed(1)}pp)`
      : undefined;
  return {
    label: plabel(p),
    thisValue: tv,
    lastValue: lv,
    changePct: volc,
    direction: directionOf(volc),
    bigMove: (volc != null && Math.abs(volc) >= VOL_BIG) || (pp != null && Math.abs(pp) >= PP_BIG),
    note,
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

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wkLabel = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? s : `wk ${d.getUTCDate()} ${M3[d.getUTCMonth()]}`;
};

async function buildInsights(system, view) {
  const out = [];

  // 1) the market story (lead) — framed by who gained vs gave up SHARE (pp), not raw volume
  const rows = view?.breakdown || [];
  const ppOf = (r) =>
    view.thisValue && view.lastValue && r.thisValue != null && r.lastValue != null
      ? (r.thisValue / view.thisValue - r.lastValue / view.lastValue) * 100
      : null;
  const withPp = rows
    .filter((r) => r.label !== 'Others' && ppOf(r) != null)
    .map((r) => ({ label: r.label, pp: ppOf(r) }));
  const gained = withPp.filter((r) => r.pp > 0).sort((a, b) => b.pp - a.pp).slice(0, 3);
  const lost = withPp.filter((r) => r.pp < 0).sort((a, b) => a.pp - b.pp).slice(0, 3);
  const ppTxt = (r) => `${r.label} (${r.pp >= 0 ? '+' : ''}${r.pp.toFixed(1)}pp)`;
  if (rows.length) {
    out.push({
      title: 'The market is the story, not any one model',
      body: `Total routed tokens reached ${T(view.thisValue)} (${
        view.changePct != null ? `${view.changePct >= 0 ? '+' : ''}${(view.changePct * 100).toFixed(0)}%` : '—'
      } ${view.label.toLowerCase()}-on-${view.label.toLowerCase()}). As the pie grew, share moved toward lower-cost and open-weight models${
        gained.length ? ` — ${gained.map(ppTxt).join(', ')} gained` : ''
      }${lost.length ? `, while ${lost.map(ppTxt).join(', ')} gave up ground` : ''}. A falling share here can sit on top of flat or only slightly lower volume.`,
    });
  }

  // 2) Gemini in context — the explicit "it didn't go to zero" card, multi-source
  const [snap, fil, ubs] = await Promise.all([
    getJson(system.source.snapshot).catch(() => null),
    getJson(system.source.filings).catch(() => null),
    getJson(system.source.ubs).catch(() => null),
  ]);
  const bullets = [];
  const g = rows.find((r) => r.label.startsWith('Google'));
  if (g && g.note) bullets.push(`OpenRouter developer tokens: Google ${g.note}, ${T(g.thisValue)} routed — down, but far from gone.`);
  const gh = snap?.summary?.geminiHighest;
  if (gh?.rank != null) bullets.push(`Top Gemini model on OpenRouter: ${gh.model}, ranked #${gh.rank} by tokens.`);
  if (ubs?.series) {
    const share = (app) => {
      const s = ubs.series.find((x) => x.app === app);
      const last = s?.points?.[s.points.length - 1];
      return last ? (last.value * 100).toFixed(1) : null;
    };
    const gm = share('Gemini');
    const cg = share('ChatGPT');
    const cl = share('Claude');
    if (gm) bullets.push(`Consumer app downloads (UBS): Gemini ${gm}% — #2 behind ChatGPT ${cg}% and ahead of Claude ${cl}%.`);
  }
  if (fil?.searchRevenueGrowth) {
    bullets.push(
      `Alphabet ${fil.period || ''}: search revenue ${fil.searchRevenueGrowth} YoY${
        fil.totalRevenue ? `, total revenue ${fil.totalRevenue} (${fil.totalRevenueGrowth} YoY)` : ''
      }.`
    );
  }
  if (bullets.length) {
    out.push({
      title: 'Gemini in context — it didn’t go to zero',
      body: 'OpenRouter measures one slice (developer API routing, cost-sensitive). On the slices that track Google’s actual business, Gemini is strong — the share drop here is a routing story, not a collapse.',
      bullets,
      asOf: snap?.scrapedAt || fil?.fetchedAt,
    });
  }
  return out;
}

export async function connect(system) {
  const usage = await getJson(system.source.usage);
  const allWeeks = usage?.weeks || [];
  const weeks = allWeeks.filter((w) => w && w.start);
  if (weeks.length < 8) throw new Error('not enough usage weeks');

  // --- MoM: complete calendar months (>=4 weeks), excluding the current partial month ---
  const months = bucketWeeks(weeks, (w) => monthOf(w.start));
  const completeMonths = Object.keys(months).filter((m) => months[m].weeks >= 4).sort();
  const tM = completeMonths[completeMonths.length - 1];
  const lM = completeMonths[completeMonths.length - 2];
  const momView = buildView(months, tM, lM, 'MoM', 'Month', monthLabel(tM), monthLabel(lM));
  attachPrior(momView, months, completeMonths, 'MoM', 'Month', monthLabel);
  attachSeries(momView, seriesViews(months, completeMonths, 'MoM', 'Month', monthLabel, 4));

  // --- WoW: the last two fully-reported (non-partial) weeks ---
  const fullWeeks = weeks.filter((w) => !w.partial).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const wkBuckets = bucketWeeks(fullWeeks, (w) => w.start);
  const wkKeys = Object.keys(wkBuckets).sort();
  const tW = wkKeys[wkKeys.length - 1];
  const lW = wkKeys[wkKeys.length - 2];
  const wowView = buildView(wkBuckets, tW, lW, 'WoW', 'Week', wkLabel(tW), wkLabel(lW));
  attachPrior(wowView, wkBuckets, wkKeys, 'WoW', 'Week', wkLabel);
  attachSeries(wowView, seriesViews(wkBuckets, wkKeys, 'WoW', 'Week', wkLabel, 4));

  // --- QoQ: complete calendar quarters (>=12 weeks) ---
  const quarters = bucketWeeks(weeks, (w) => quarterOf(w.start));
  const completeQ = Object.keys(quarters).filter((q) => quarters[q].weeks >= 12).sort();
  const tQ = completeQ[completeQ.length - 1];
  const lQ = completeQ[completeQ.length - 2];
  const qoqView = buildView(quarters, tQ, lQ, 'QoQ', 'Quarter', quarterLabel(tQ), quarterLabel(lQ));
  attachPrior(qoqView, quarters, completeQ, 'QoQ', 'Quarter', quarterLabel);
  attachSeries(qoqView, seriesViews(quarters, completeQ, 'QoQ', 'Quarter', quarterLabel, 3));

  const views = [wowView, momView, qoqView];
  const def = momView.available ? momView : qoqView.available ? qoqView : wowView.available ? wowView : views[1];
  const insights = await buildInsights(system, def);

  const block = makeBlock(system, {
    unit: 'tokens',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: def.changePct,
    direction: def.direction,
    asOf: usage.updatedAt || new Date().toISOString(),
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      'OpenRouter routed model-token volume, weekly data rolled to complete weeks / months / quarters. Each provider row shows token volume change with its share shift alongside. Providers not consistently broken out fold into Others so totals stay honest. "Why it moved" adds the consumer-app and Alphabet-filing context for Google/Gemini.',
  });
  block.views = views;
  block.breakdownNoun = 'provider';
  block.changeNoun = 'Token volume change';
  block.insights = insights;
  return block;
}
