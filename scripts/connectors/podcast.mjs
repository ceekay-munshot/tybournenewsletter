// Podcast Themes — investor-podcast episodes analysed, bucketed by publish date (QoQ).
// Coverage/volume metric; the thematic read-through feeds the newsletter (next phase).
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, currentQuarterId } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

const SHOW_LABEL = {
  stratechery: 'Stratechery',
  ingoodcompany: 'In Good Company',
  sources: 'Sources',
  aidaily: 'AI Daily',
  iltb: 'Invest Like the Best',
  cheekypint: 'Cheeky Pint',
  allin: 'All-In',
  oddlots: 'Odd Lots',
  lennys: "Lenny's",
  acquired: 'Acquired',
  bg2: 'BG2',
  benmarc: 'BenMarc',
};

export async function connect(system) {
  const raw = await getJson(system.source.episodes);
  const list = Array.isArray(raw) ? raw : raw?.episodes || raw?.items || raw?.data || [];
  if (!Array.isArray(list) || !list.length) {
    return makeBlock(system, {
      status: 'partial',
      statusReason: 'episodes endpoint returned nothing usable',
      unit: 'episodes',
      comparison: 'QoQ',
      thisPeriodLabel: '—',
      lastPeriodLabel: '—',
      breakdown: [],
      asOf: new Date().toISOString(),
      notes: 'Podcast feeds the newsletter narrative (next phase).',
    });
  }

  const dated = list.filter((e) => e.publishedAt);
  const byQ = {};
  for (const e of dated) {
    const q = quarterOf(e.publishedAt);
    byQ[q] = (byQ[q] || 0) + 1;
  }
  const qs = Object.keys(byQ).sort();
  const thisQ = qs[qs.length - 1];
  const lastQ = qs[qs.length - 2];
  const thisN = byQ[thisQ] || 0;
  const lastN = lastQ ? byQ[lastQ] || 0 : null;

  const showQ = (q) => {
    const c = {};
    for (const e of dated) if (quarterOf(e.publishedAt) === q) {
      const s = e.podcastId || 'other';
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  };
  const tShow = showQ(thisQ);
  const lShow = lastQ ? showQ(lastQ) : {};
  const breakdown = Object.keys(tShow)
    .map((s) => {
      const tv = tShow[s];
      const lv = lastQ ? lShow[s] ?? null : null;
      return { label: SHOW_LABEL[s] || s, thisValue: tv, lastValue: lv, changePct: pctChange(tv, lv), direction: directionOf(pctChange(tv, lv)) };
    })
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const qtd = thisQ === currentQuarterId() ? ' (QTD)' : '';
  const asOf = dated.map((e) => e.publishedAt).sort().slice(-1)[0];

  return makeBlock(system, {
    unit: 'episodes',
    comparison: 'QoQ',
    thisPeriodLabel: `${quarterLabel(thisQ)}${qtd}`,
    lastPeriodLabel: lastQ ? quarterLabel(lastQ) : '—',
    thisValue: thisN,
    lastValue: lastN,
    changePct: pctChange(thisN, lastN),
    asOf,
    breakdown,
    notes: `Episodes analysed across ${Object.keys(tShow).length} investor shows, bucketed by publish date${qtd ? ' (latest quarter is quarter-to-date)' : ''}. Thematic analysis feeds the newsletter (next phase).`,
  });
}
