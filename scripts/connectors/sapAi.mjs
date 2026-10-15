// SAP AI Strategy — practitioner sentiment (1-5), scored DAILY, at three windows
// (Weekly / MoM / QoQ). Overall sentiment headline + per-topic breakdown (point
// deltas), plus the lifted "Key Findings" explaining the biggest-moving topics —
// stamped with each finding's own date, since the research refreshes separately
// from the daily scores.
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, monthOf, monthLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const BIG_MOVE_PTS = 0.2; // a >=0.2-point move on a 1-5 scale is notable
const round2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const weekKey = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
};

const PERIODS = [
  { comparison: 'WoW', label: 'Week', keyFn: weekKey, labelFn: (k) => `wk ${fmtShort(k)}` },
  { comparison: 'MoM', label: 'Month', keyFn: (iso) => monthOf(iso), labelFn: (k) => monthLabel(k) },
  { comparison: 'QoQ', label: 'Quarter', keyFn: (iso) => quarterOf(iso), labelFn: (k) => quarterLabel(k) },
];

const avgIn = (days, key, keyFn, valFn) => {
  let s = 0;
  let n = 0;
  for (const d of days) {
    if (!d.date || keyFn(d.date) !== key) continue;
    const v = valFn(d);
    if (v != null && Number.isFinite(v)) {
      s += v;
      n += 1;
    }
  }
  return n ? s / n : null;
};

const lastTwoKeys = (days, keyFn, valFn) => {
  const seen = new Set();
  for (const d of days) {
    const v = valFn(d);
    if (v == null || !Number.isFinite(v) || !d.date) continue;
    const k = keyFn(d.date);
    if (k) seen.add(k);
  }
  const keys = [...seen].sort();
  return [keys[keys.length - 1] ?? null, keys[keys.length - 2] ?? null];
};

export async function connect(system) {
  const [trend, dash] = await Promise.all([
    getJson(system.source.trend),
    getJson(system.source.dashboard).catch(() => null),
  ]);
  const days = Array.isArray(trend?.days) ? trend.days.filter((d) => d && d.date) : [];
  if (days.length < 2) throw new Error('insufficient SAP trend days');

  // authoritative topic labels from dashboard.json; only keep topics the trend actually scores
  const dashTopics = dash?.topics || {};
  const trendTopics = new Set();
  for (const d of days) for (const id of Object.keys(d.topics || {})) trendTopics.add(id);
  const topicIds = [...trendTopics];
  const labelOf = {};
  for (const id of topicIds) labelOf[id] = dashTopics[id]?.label || id;

  const views = PERIODS.map(({ comparison, label, keyFn, labelFn }) => {
    const [thisKey, lastKey] = lastTwoKeys(days, keyFn, (d) => d.overall?.score);
    if (!thisKey || !lastKey) {
      return {
        comparison,
        label,
        available: false,
        unavailableReason: 'Not enough history for this window yet.',
        thisPeriodLabel: '—',
        lastPeriodLabel: '—',
        thisValue: null,
        lastValue: null,
        changePct: null,
        changeAbs: null,
        changeDisplay: 'pts',
        direction: 'flat',
        breakdown: [],
      };
    }
    const oThis = round2(avgIn(days, thisKey, keyFn, (d) => d.overall?.score));
    const oLast = round2(avgIn(days, lastKey, keyFn, (d) => d.overall?.score));
    const changeAbs = oThis != null && oLast != null ? round2(oThis - oLast) : null;

    const rows = topicIds
      .map((id) => {
        const t = round2(avgIn(days, thisKey, keyFn, (d) => d.topics?.[id]?.score));
        const l = round2(avgIn(days, lastKey, keyFn, (d) => d.topics?.[id]?.score));
        const ca = t != null && l != null ? round2(t - l) : null;
        return {
          label: labelOf[id],
          thisValue: t,
          lastValue: l,
          changePct: null,
          changeAbs: ca,
          changeDisplay: 'pts',
          direction: directionOf(ca),
          bigMove: ca != null && Math.abs(ca) >= BIG_MOVE_PTS,
        };
      })
      .sort((a, b) => Math.abs(b.changeAbs ?? 0) - Math.abs(a.changeAbs ?? 0));

    const softer = rows.filter((r) => r.direction === 'down').length;
    const firmer = rows.filter((r) => r.direction === 'up').length;
    const summary =
      changeAbs != null
        ? `${label}-on-${label.toLowerCase()} overall SAP-AI sentiment ${changeAbs >= 0 ? 'up' : 'down'} ${Math.abs(
            changeAbs
          ).toFixed(2)} pts to ${oThis?.toFixed(2)}/5 — ${softer} topic${softer === 1 ? '' : 's'} softer, ${firmer} firmer.`
        : undefined;

    return {
      comparison,
      label,
      available: changeAbs != null,
      thisPeriodLabel: labelFn(thisKey),
      lastPeriodLabel: labelFn(lastKey),
      thisValue: oThis,
      lastValue: oLast,
      changePct: null,
      changeAbs,
      changeDisplay: 'pts',
      direction: directionOf(changeAbs),
      bigMove: changeAbs != null && Math.abs(changeAbs) >= BIG_MOVE_PTS,
      breakdown: rows,
      summary,
    };
  });

  const def = views.find((v) => v.comparison === 'MoM' && v.available) || views.find((v) => v.available) || views[1];

  // "Why it moved": lift the key findings for the biggest MoM movers, stamped with
  // each topic's own research date (the research refreshes separately from scores).
  const labelToId = Object.fromEntries(Object.entries(labelOf).map(([id, l]) => [l, id]));
  const momRows = views.find((v) => v.comparison === 'MoM')?.breakdown || [];
  const insights = momRows
    .filter((r) => r.changeAbs != null && Math.abs(r.changeAbs) > 0)
    .slice(0, 3)
    .map((r) => {
      const id = labelToId[r.label];
      const t = dashTopics[id];
      if (!t || (!t.summary && !(t.findings || []).length)) return null;
      const move = `${r.changeAbs >= 0 ? '+' : ''}${r.changeAbs.toFixed(2)} pts MoM`;
      return {
        title: `${r.label} — ${move}`,
        body: t.summary || undefined,
        bullets: (t.findings || []).slice(0, 2),
        asOf: t.ranAt || dash?.generatedAt,
      };
    })
    .filter(Boolean);

  const asOf = trend?.updatedAt || days[days.length - 1].date;
  const block = makeBlock(system, {
    unit: 'score 1-5',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: null,
    changeAbs: def.changeAbs,
    changeDisplay: 'pts',
    direction: def.direction,
    asOf,
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      'Practitioner sentiment (1-5) from HN / Reddit / StackExchange + SAP docs, scored daily; change shown as a point delta. "Why it moved" is lifted from the dashboard’s own research findings, stamped with each topic’s research date.',
  });
  block.views = views;
  block.breakdownNoun = 'topic';
  block.changeNoun = 'Sentiment change';
  block.insights = insights;
  return block;
}
