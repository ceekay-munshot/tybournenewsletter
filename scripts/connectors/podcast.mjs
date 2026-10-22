// Podcast Themes — a NARRATIVE card, not a % mover. Investor-podcast episodes are
// surfaced as the quarter's recurring themes + a tone read + a CONSOLIDATED NOTE that
// compares this quarter to last (the "where is the world moving" read from the brief),
// all derived from the live /api/episodes payload (each episode carries
// summary.highlights / summary.tone). It carries changePct:null so the movers chart
// excludes it (counts are too small and QTD-vs-full-quarter would be a false signal).
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, currentQuarterId } from '../lib/quarters.mjs';
import { makeBlock } from '../lib/changeBlock.mjs';

export const SHOW_LABEL = {
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

/** Recurring themes (deduped key highlights, newest first) + tone counts for a set of episodes. */
function digest(episodes, cap = 10) {
  const themes = [];
  const seen = new Set();
  const recent = [...episodes].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  for (const e of recent) {
    const hs = e.summary?.highlights;
    if (!Array.isArray(hs)) continue;
    const pick = hs.find((h) => h && h.key && h.title) || hs.find((h) => h && h.title);
    if (!pick) continue;
    const title = String(pick.title).trim();
    const norm = title.toLowerCase();
    if (title && !seen.has(norm)) {
      seen.add(norm);
      themes.push(title);
    }
    if (themes.length >= cap) break;
  }
  const toneCount = {};
  for (const e of episodes) {
    const o = e.summary?.tone?.overall;
    if (o) toneCount[o] = (toneCount[o] || 0) + 1;
  }
  return { themes, toneCount, count: episodes.length };
}

const toneStr = (toneCount) => {
  const s = Object.entries(toneCount).sort((a, b) => b[1] - a[1]);
  return s.length ? s.map(([k, v]) => `${v} ${k}`).join(', ') : null;
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
  const curEps = dated.filter((e) => quarterOf(e.publishedAt) === thisQ);
  const prevEps = lastQ ? dated.filter((e) => quarterOf(e.publishedAt) === lastQ) : [];

  const cur = digest(curEps);
  const prev = digest(prevEps);

  const tone = toneStr(cur.toneCount) ? `Tone across ${cur.count} episodes — ${toneStr(cur.toneCount)}` : undefined;

  // Episodes per show this quarter (supporting breakdown; no % change).
  const showCount = {};
  for (const e of curEps) {
    const s = e.podcastId || 'other';
    showCount[s] = (showCount[s] || 0) + 1;
  }
  const breakdown = Object.keys(showCount)
    .map((s) => ({ label: SHOW_LABEL[s] || s, thisValue: showCount[s], lastValue: null, changePct: null, direction: 'flat' }))
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const qtd = thisQ === currentQuarterId() ? ' (QTD)' : '';
  const thisLabel = `${quarterLabel(thisQ)}${qtd}`;
  const lastLabel = lastQ ? quarterLabel(lastQ) : null;
  const asOf = dated.map((e) => e.publishedAt).sort().slice(-1)[0];

  // Consolidated note — the quarter-over-quarter read, built from the real themes + tone.
  const newThemesAll = cur.themes.filter((t) => !prev.themes.some((p) => p.toLowerCase() === t.toLowerCase()));
  const newThemes = newThemesAll.slice(0, 3);
  const parts = [`${thisLabel}: ${cur.count} investor-podcast episodes across ${Object.keys(showCount).length} shows.`];
  if (cur.themes.length) parts.push(`The recurring threads — ${cur.themes.slice(0, 4).join('; ')}.`);
  if (toneStr(cur.toneCount)) parts.push(`Sentiment ran ${toneStr(cur.toneCount)}.`);
  if (lastLabel && prev.count) {
    const pt = toneStr(prev.toneCount);
    parts.push(
      `Last quarter (${lastLabel}) ran ${prev.count} episodes${pt ? ` (${pt})` : ''}${prev.themes.length ? `, centred on ${prev.themes.slice(0, 3).join('; ')}` : ''}.`
    );
    if (newThemes.length) parts.push(`New to the conversation this quarter: ${newThemes.join('; ')}.`);
  }
  const summary = parts.join(' ');

  return makeBlock(system, {
    metricLabel: 'Quarter themes',
    unit: 'episodes',
    comparison: 'QoQ',
    changePct: null,
    thisPeriodLabel: thisLabel,
    lastPeriodLabel: lastLabel || '—',
    thisValue: cur.count,
    lastValue: prev.count || null,
    asOf,
    highlights: cur.themes,
    tone,
    thisTone: toneStr(cur.toneCount) || undefined,
    prevHighlights: prev.themes,
    prevTone: toneStr(prev.toneCount) || undefined,
    newHighlights: newThemesAll.slice(0, 10),
    summary,
    breakdown,
    notes: `${cur.count} investor-podcast episodes analysed this quarter across ${Object.keys(showCount).length} shows. A qualitative read of the quarter's narrative, not a quantitative mover.`,
  });
}
