// SAP AI Strategy — practitioner sentiment (1-5), daily index rolled to a ~91-day compare.
// GET trend -> {updatedAt, days:[{date, overall:{score}, topics:{id:{score}}}]}.
import { getJson } from '../lib/http.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

const TOPIC_LABEL = {
  joule_sentiment: 'Joule (AI copilot)',
  btp_ai: 'BTP AI platform',
  partner_views: 'Partner views',
  vs_competitors: 'Vs competitors',
  bdc_cloud: 'Business Data Cloud',
  customer_sat: 'Customer satisfaction',
  s4hana_ai: 'S/4HANA AI',
  risks_gaps: 'Risks & gaps',
  rpt1: 'Reporting & analytics',
};

const qLabel = (dt) => `Q${Math.floor(dt.getUTCMonth() / 3) + 1} '${String(dt.getUTCFullYear()).slice(2)}`;

export async function connect(system) {
  const d = await getJson(system.source.trend);
  const days = d?.days || [];
  if (days.length < 2) throw new Error('insufficient SAP trend days');

  const last = days[days.length - 1];
  const lastDate = new Date(`${last.date}T00:00:00Z`);
  const target = new Date(lastDate);
  target.setUTCDate(target.getUTCDate() - 91);

  let prior = days[0];
  let best = Infinity;
  for (const dd of days) {
    const diff = Math.abs(new Date(`${dd.date}T00:00:00Z`) - target);
    if (diff < best) {
      best = diff;
      prior = dd;
    }
  }

  const thisScore = last.overall?.score ?? null;
  const priorScore = prior.overall?.score ?? null;
  const changeAbs = thisScore != null && priorScore != null ? Math.round((thisScore - priorScore) * 100) / 100 : null;

  const topics = last.topics || {};
  const priorTopics = prior.topics || {};
  const breakdown = Object.keys(topics)
    .map((id) => {
      const tv = topics[id]?.score ?? null;
      const lv = priorTopics[id]?.score ?? null;
      const cp = pctChange(tv, lv);
      return { label: TOPIC_LABEL[id] || id, thisValue: tv, lastValue: lv, changePct: cp, direction: directionOf(cp) };
    })
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  return makeBlock(system, {
    unit: 'score 1-5',
    comparison: 'QoQ',
    thisPeriodLabel: qLabel(lastDate),
    lastPeriodLabel: qLabel(new Date(`${prior.date}T00:00:00Z`)),
    thisValue: thisScore,
    lastValue: priorScore,
    changePct: pctChange(thisScore, priorScore),
    changeAbs,
    direction: directionOf(changeAbs),
    asOf: d.updatedAt || last.date,
    breakdown,
    notes: 'Practitioner sentiment (1-5) from HN / Reddit / StackExchange + SAP docs; daily index compared across ~91 days.',
  });
}
