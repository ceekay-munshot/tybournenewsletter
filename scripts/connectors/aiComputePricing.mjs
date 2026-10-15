// AI Compute / Model Pricing — equal-weighted basket of comparable frontier models
// ($/1M tokens). Frontier LIST prices are sticky: they're flat month-to-month and
// move on a quarterly cadence, so the honest toggle is QoQ (default) with Week/Month
// shown as "no change in this window". The per-provider breakdown is the real signal
// (e.g. DeepSeek's big input-price cut). Output price is carried in the summary.
import { getJson } from '../lib/http.mjs';
import { quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

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
      'Equal-weighted basket of comparable frontier models ($/1M tokens), input price. List prices reset quarterly — month-to-month they are flat. The per-provider breakdown shows the quarterly movers; output-price change is noted in the summary.',
  });
  block.views = views;
  block.breakdownNoun = 'provider';
  block.changeNoun = 'Price change';
  block.insights = insights;
  return block;
}
