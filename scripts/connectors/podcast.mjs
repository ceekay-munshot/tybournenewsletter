// Podcast Themes — a NARRATIVE card, not a % mover. Investor-podcast episodes are
// surfaced as the quarter's recurring themes + a tone read, derived from the live
// /api/episodes payload (each episode carries summary.highlights / summary.tone).
// It carries changePct:null so the movers chart excludes it (counts are too small
// and QTD-vs-full-quarter would be a false signal).
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, currentQuarterId } from '../lib/quarters.mjs';
import { makeBlock } from '../lib/changeBlock.mjs';

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
      metricLabel: 'Quarter themes',
      unit: 'episodes',
      comparison: 'QoQ',
      changePct: null,
      thisPeriodLabel: '—',
      lastPeriodLabel: '—',
      breakdown: [],
      asOf: new Date().toISOString(),
      notes: 'Podcast feeds the newsletter narrative (next phase).',
    });
  }

  const dated = list.filter((e) => e.publishedAt);
  const qids = [...new Set(dated.map((e) => quarterOf(e.publishedAt)))].sort();
  const thisQ = qids[qids.length - 1];
  const lastQ = qids[qids.length - 2];
  const cur = dated.filter((e) => quarterOf(e.publishedAt) === thisQ);
  const recent = [...cur].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

  // Recurring themes: the key highlight from each of the most recent episodes, de-duplicated.
  const highlights = [];
  const seen = new Set();
  for (const e of recent) {
    const hs = e.summary?.highlights;
    if (!Array.isArray(hs)) continue;
    const pick = hs.find((h) => h && h.key && h.title) || hs.find((h) => h && h.title);
    if (!pick) continue;
    const title = String(pick.title).trim();
    const norm = title.toLowerCase();
    if (title && !seen.has(norm)) {
      seen.add(norm);
      highlights.push(title);
    }
    if (highlights.length >= 6) break;
  }

  // Tone read from each episode's summary.tone.overall.
  const toneCount = {};
  for (const e of cur) {
    const o = e.summary?.tone?.overall;
    if (o) toneCount[o] = (toneCount[o] || 0) + 1;
  }
  const toneSorted = Object.entries(toneCount).sort((a, b) => b[1] - a[1]);
  const tone = toneSorted.length
    ? `Tone across ${cur.length} episodes — ${toneSorted.map(([k, v]) => `${v} ${k}`).join(', ')}`
    : undefined;

  // Supporting breakdown: episodes per show this quarter (no % change).
  const showCount = {};
  for (const e of cur) {
    const s = e.podcastId || 'other';
    showCount[s] = (showCount[s] || 0) + 1;
  }
  const breakdown = Object.keys(showCount)
    .map((s) => ({ label: SHOW_LABEL[s] || s, thisValue: showCount[s], lastValue: null, changePct: null, direction: 'flat' }))
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const qtd = thisQ === currentQuarterId() ? ' (QTD)' : '';
  const asOf = dated.map((e) => e.publishedAt).sort().slice(-1)[0];

  return makeBlock(system, {
    metricLabel: 'Quarter themes',
    unit: 'episodes',
    comparison: 'QoQ',
    changePct: null,
    thisPeriodLabel: `${quarterLabel(thisQ)}${qtd}`,
    lastPeriodLabel: lastQ ? quarterLabel(lastQ) : '—',
    thisValue: cur.length,
    lastValue: null,
    asOf,
    highlights,
    tone,
    breakdown,
    notes: `${cur.length} investor-podcast episodes analysed this quarter across ${Object.keys(showCount).length} shows. Themes feed the newsletter narrative; this is a qualitative read, not a quantitative mover.`,
  });
}
