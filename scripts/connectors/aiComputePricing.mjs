// AI Compute / Model Pricing — equal-weighted basket of comparable frontier models
// ($/1M tokens). Frontier LIST prices are sticky: they're flat month-to-month and
// move on a quarterly cadence, so the honest toggle is QoQ (default) with Week/Month
// shown as "no change in this window". The per-provider breakdown is the real signal
// (e.g. DeepSeek's big input-price cut). Output price is carried in the summary.
import { getJson } from '../lib/http.mjs';
import { quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, attachSeries } from '../lib/changeBlock.mjs';

const BIG_MOVE = 0.05; // list prices are sticky — a >=5% move is a real cut/hike

const flatView = (comparison, label, reason) => ({
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
});

export async function connect(system) {
  const [histIn, histOut, sig] = await Promise.all([
    getJson(system.source.history),
    getJson(system.source.history.replace('metric=input', 'metric=output')).catch(() => null),
    getJson(system.source.signal).catch(() => null),
  ]);
  const qIn = Array.isArray(histIn?.quarters) ? histIn.quarters : [];
  if (qIn.length < 2) throw new Error('pricing-history returned <2 quarters');

  const thisQ = qIn[0];
  const lastQ = qIn[1];
  // compute from the averages so a null precomputed `qoq` on the partial quarter can't blank the headline
  const qoq = thisQ.avg != null && lastQ.avg ? (thisQ.avg - lastQ.avg) / lastQ.avg : (thisQ.qoq ?? null);
  const oThis = histOut?.quarters?.[0];
  const oLast = histOut?.quarters?.[1];
  const outChange = oThis?.avg != null && oLast?.avg ? (oThis.avg - oLast.avg) / oLast.avg : (oThis?.qoq ?? null);

  const rows = (sig?.quarters?.[0]?.rows || [])
    .map((r) => {
      const q = r.priceQoq ?? null;
      const avg = r.avg ?? null;
      const last = avg != null && q != null && 1 + q !== 0 ? avg / (1 + q) : null;
      return {
        label: r.label || r.slug,
        thisValue: avg,
        lastValue: last,
        changePct: q,
        direction: directionOf(q),
        bigMove: q != null && Math.abs(q) >= BIG_MOVE,
      };
    })
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));

  const outTxt = outChange == null ? 'flat' : `${outChange >= 0 ? '+' : ''}${(outChange * 100).toFixed(1)}%`;
  const biggest = rows.find((r) => r.changePct != null);
  const qoqSummary = `Quarter-on-quarter input price ${qoq >= 0 ? 'up' : 'down'} ${Math.abs((qoq || 0) * 100).toFixed(
    1
  )}% (output ${outTxt})${biggest ? `; biggest move: ${biggest.label} ${biggest.changePct >= 0 ? '+' : ''}${(biggest.changePct * 100).toFixed(1)}%` : ''}. List prices are otherwise flat month-to-month.`;

  const qoqView = {
    comparison: 'QoQ',
    label: 'Quarter',
    available: true,
    thisPeriodLabel: quarterLabel(thisQ.id) + (thisQ.partial ? ' (QTD)' : ''),
    lastPeriodLabel: quarterLabel(lastQ.id),
    thisValue: thisQ.avg ?? null,
    lastValue: lastQ.avg ?? null,
    changePct: qoq,
    changeAbs: thisQ.avg != null && lastQ.avg != null ? thisQ.avg - lastQ.avg : null,
    direction: directionOf(qoq),
    bigMove: qoq != null && Math.abs(qoq) >= BIG_MOVE,
    breakdown: rows,
    summary: qoqSummary,
  };

  // --- Prior QoQ (one quarter further back) so the table shows two consecutive periods of trend ---
  // Headline uses the clean basket series (histIn.quarters), which chains across quarters:
  // prior pair = quarters[1] vs quarters[2]; prevValue = the Q2 basket average (prior pair's "from").
  const q2 = qIn[2];
  const priorQoq = q2
    ? lastQ.avg != null && q2.avg
      ? (lastQ.avg - q2.avg) / q2.avg
      : (lastQ.qoq ?? null)
    : null;
  if (q2 && priorQoq != null) {
    qoqView.prevLabel = quarterLabel(q2.id);
    qoqView.prevValue = q2.avg ?? null;
    qoqView.prevChangePct = priorQoq;
    qoqView.prevChangeAbs = lastQ.avg != null && q2.avg != null ? lastQ.avg - q2.avg : null;
    qoqView.prevDirection = directionOf(priorQoq);
  }

  // Per-provider prior move from sig.quarters[1] (its priceQoq = the Q2->Q3 move). Each row's
  // `avg` is over that quarter's own matched-model basket, so provider averages do NOT chain
  // across quarters the way the clean series does. We therefore derive prevValue from the row's
  // own lastValue + the prior move — exactly as the existing lastValue is derived from avg +
  // priceQoq — so prevValue -> lastValue equals prevChangePct (the contract), while prevChangePct
  // itself stays the honest reported quarterly move.
  const priorProv = new Map((sig?.quarters?.[1]?.rows || []).map((r) => [r.label || r.slug, r]));
  for (const row of rows) {
    const pq = priorProv.get(row.label)?.priceQoq ?? null;
    if (pq == null) continue;
    row.prevChangePct = pq;
    row.prevDirection = directionOf(pq);
    row.prevValue = row.lastValue != null && 1 + pq !== 0 ? row.lastValue / (1 + pq) : null;
  }

  // last-3 quarters as a series (QoQ value + change per column), additive — one column per
  // quarter, newest-first. Built the SAME way the headline/rows above are derived, just stepped
  // back: headline from the clean basket series (qIn[i] vs qIn[i+1]); per-provider rows from that
  // quarter's own sig.quarters[i] (avg + reported priceQoq), so index i=0 reproduces the live view.
  // attachSeries matches rows by label (a provider missing from an older quarter simply has no
  // point there) and no-ops below 2 quarters.
  const buildQoqView = (i) => {
    const tQ = qIn[i];
    const lQ = qIn[i + 1];
    const q = tQ.avg != null && lQ.avg ? (tQ.avg - lQ.avg) / lQ.avg : (tQ.qoq ?? null);
    const rws = (sig?.quarters?.[i]?.rows || [])
      .map((r) => {
        const rq = r.priceQoq ?? null;
        const avg = r.avg ?? null;
        const last = avg != null && rq != null && 1 + rq !== 0 ? avg / (1 + rq) : null;
        return {
          label: r.label || r.slug,
          thisValue: avg,
          lastValue: last,
          changePct: rq,
          direction: directionOf(rq),
          bigMove: rq != null && Math.abs(rq) >= BIG_MOVE,
        };
      })
      .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
    return {
      comparison: 'QoQ',
      label: 'Quarter',
      available: true,
      thisPeriodLabel: quarterLabel(tQ.id) + (tQ.partial ? ' (QTD)' : ''),
      lastPeriodLabel: quarterLabel(lQ.id),
      thisValue: tQ.avg ?? null,
      lastValue: lQ.avg ?? null,
      changePct: q,
      changeAbs: tQ.avg != null && lQ.avg != null ? tQ.avg - lQ.avg : null,
      direction: directionOf(q),
      bigMove: q != null && Math.abs(q) >= BIG_MOVE,
      breakdown: rws,
    };
  };
  const qoqSeries = [];
  for (let i = 0; i < 3; i++) {
    if (!qIn[i] || !qIn[i + 1]) break;
    qoqSeries.push(buildQoqView(i));
  }
  attachSeries(qoqView, qoqSeries);

  const views = [
    flatView('WoW', 'Week', 'No weekly model-price series.'),
    flatView(
      'MoM',
      'Month',
      'Frontier model list prices don’t change within a month — they reset on a quarterly cadence. See the Quarter view for the real moves.'
    ),
    qoqView,
  ];

  const callout = (sig?.callouts || [])[0];
  const insights = callout ? [{ title: `${callout.title} — ${callout.provider}`, body: callout.detail }] : [];

  let asOf = new Date().toISOString();
  if (thisQ.start && thisQ.dayCount) {
    const d = new Date(`${thisQ.start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (Number(thisQ.dayCount) - 1));
    asOf = d.toISOString();
  }

  // The signal endpoint can report a degraded fetch (some providers temporarily
  // failed) and then return fewer provider rows. Surface that honestly so a thin
  // run is explained rather than looking like real data — the 6-hourly refresh
  // self-heals once the source recovers.
  const degraded = sig?.degraded === true || (Array.isArray(sig?.providerErrors) && sig.providerErrors.length > 0);
  const degradedNote = degraded
    ? ` NOTE: the pricing source reported a degraded fetch this run, so some providers may be missing from the breakdown — it refreshes automatically.`
    : '';

  const block = makeBlock(system, {
    unit: '$/1M tokens',
    comparison: 'QoQ',
    thisPeriodLabel: qoqView.thisPeriodLabel,
    lastPeriodLabel: qoqView.lastPeriodLabel,
    thisValue: qoqView.thisValue,
    lastValue: qoqView.lastValue,
    changePct: qoq,
    direction: directionOf(qoq),
    asOf,
    breakdown: rows,
    summary: qoqSummary,
    notes:
      'Equal-weighted basket of comparable frontier models ($/1M tokens), input price. List prices reset quarterly — month-to-month they are flat. The per-provider breakdown shows the quarterly movers; output-price change is noted in the summary.' +
      degradedNote,
  });
  block.views = views;
  block.breakdownNoun = 'provider';
  block.changeNoun = 'Price change';
  block.insights = insights;
  return block;
}
