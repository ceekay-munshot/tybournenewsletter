// Hugging Face Activity — new AI Spaces created, month-over-month.
// Only ~1 quarter of weekly data exists, so this is honestly MoM (never a faked QoQ).
// Headline figures come from the Hub's own monthly `insights.facts` (authoritative);
// the use-case breakdown is derived from the weekly `series`.
import { getJson } from '../lib/http.mjs';
import { monthLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

const UC_LABEL = {
  '3d-gaming': '3D / gaming',
  'chat-assistant': 'Chat & assistants',
  coding: 'Coding',
  'data-analysis': 'Data analysis',
  'document-ai': 'Document AI',
  education: 'Education',
  'image-generation': 'Image generation',
  'music-generation': 'Music generation',
  other: 'Other',
  robotics: 'Robotics',
  'scientific-tools': 'Scientific tools',
  'search-research': 'Search & research',
  'video-generation': 'Video generation',
  'voice-audio': 'Voice & audio',
};

const prevMonthKey = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export async function connect(system) {
  const [d, ins] = await Promise.all([
    getJson(system.source.series),
    getJson(system.source.insights).catch(() => null),
  ]);
  const weeks = d?.weeks || [];
  const series = d?.series || [];
  if (!weeks.length || !series.length) throw new Error('no HF series');

  const monthOf = (w) => w.slice(0, 7);
  const spaceSeries = series.filter((s) => s.cut === 'spaces_by_use_case');
  const totalPerWeek = weeks.map((_, i) => spaceSeries.reduce((a, s) => a + (s.values[i] || 0), 0));
  const trend = weeks.map((w, i) => ({ period: w.slice(5), value: totalPerWeek[i] }));

  // Headline + "new models" secondary from the Hub's own monthly facts.
  const month0 = ins?.month?.[0];
  const facts = month0?.facts || [];
  const fact = (sub) => facts.find((f) => String(f.what || '').toLowerCase().includes(sub));
  const periodKey = month0?.periodKey;

  let thisVal = null;
  let lastVal = null;
  let thisM = periodKey || monthOf(weeks[weeks.length - 1]);
  let lastM = prevMonthKey(thisM);
  const spacesFact = fact('new spaces in total');
  if (spacesFact) {
    thisVal = spacesFact.value ?? null;
    lastVal = spacesFact.prev ?? null;
  } else {
    // fallback: calendar-month sums from the series
    const mt = {};
    const wpm = {};
    weeks.forEach((w, i) => {
      const m = monthOf(w);
      mt[m] = (mt[m] || 0) + totalPerWeek[i];
      wpm[m] = (wpm[m] || 0) + 1;
    });
    const full = Object.keys(mt).filter((m) => wpm[m] >= 4).sort();
    const use = full.length >= 2 ? full.slice(-2) : Object.keys(mt).sort().slice(-2);
    [lastM, thisM] = use;
    thisVal = mt[thisM];
    lastVal = mt[lastM];
  }

  const monthAvg = (s, ym) => {
    const idx = weeks.map((w, i) => (monthOf(w) === ym ? i : -1)).filter((i) => i >= 0);
    return idx.length ? idx.reduce((a, i) => a + (s.values[i] || 0), 0) / idx.length : null;
  };
  const breakdown = series
    .filter((s) => s.cut === 'share_by_use_case')
    .map((s) => {
      const tv = monthAvg(s, thisM);
      const lv = monthAvg(s, lastM);
      return { label: UC_LABEL[s.dimension] || s.dimension, thisValue: tv, lastValue: lv, changePct: pctChange(tv, lv), direction: directionOf(pctChange(tv, lv)) };
    })
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const secondary = [];
  const modelsFact = fact('new models in total');
  if (modelsFact) {
    secondary.push(
      makeBlock(system, {
        metricLabel: 'New AI models',
        unit: 'models',
        comparison: 'MoM',
        thisPeriodLabel: monthLabel(thisM),
        lastPeriodLabel: monthLabel(lastM),
        thisValue: modelsFact.value ?? null,
        lastValue: modelsFact.prev ?? null,
        changePct: pctChange(modelsFact.value, modelsFact.prev),
        asOf: weeks[weeks.length - 1],
        breakdown: [],
      })
    );
  }

  return makeBlock(system, {
    unit: 'new Spaces',
    comparison: 'MoM',
    thisPeriodLabel: monthLabel(thisM),
    lastPeriodLabel: monthLabel(lastM),
    thisValue: thisVal,
    lastValue: lastVal,
    changePct: pctChange(thisVal, lastVal),
    asOf: weeks[weeks.length - 1],
    breakdown,
    trend,
    notes: month0?.narrative || 'Only ~1 quarter of weekly data — compared month-over-month; breakdown shows use-case share shifts.',
  });
}
