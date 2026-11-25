// Hugging Face Activity — new AI Spaces created on the Hub, Weekly and MoM.
// The Hub's own insights.json is the authoritative, self-consistent source: each
// period (week / month) ships `facts` carrying value, prev and changePct, so the
// headline, the use-case breakdown and the model-family shifts all come straight
// from the Hub's published numbers. History starts late-July 2026, so a QoQ needs
// two full quarters we don't have yet — shown honestly as unavailable.
import { getJson } from '../lib/http.mjs';
import { monthLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, attachPrev, attachSeries } from '../lib/changeBlock.mjs';

const UC_LABEL = {
  '3d-gaming': '3D / gaming',
  'chat-assistant': 'Chat & assistants',
  coding: 'Coding',
  'data-analysis': 'Data analysis',
  'document-ai': 'Document AI',
  education: 'Education',
  'image-generation': 'Image generation',
  'music-generation': 'Music generation',
  other: 'Other / mixed',
  robotics: 'Robotics',
  'scientific-tools': 'Scientific tools',
  'search-research': 'Search & research',
  'video-generation': 'Video generation',
  'voice-audio': 'Voice & audio',
};
const FAMILY_LABEL = {
  'glm-zhipu': 'GLM (Zhipu)',
  'kimi-moonshot': 'Kimi (Moonshot)',
  'nvidia-nemotron': 'Nvidia Nemotron',
  'other-open': 'Other open models',
  unknown: 'Unresolved family',
};
const famLabel = (d) => FAMILY_LABEL[d] || d.charAt(0).toUpperCase() + d.slice(1);

// Display names for the deeper cuts the Hub ships alongside the use-case split. These power
// the supporting tables (the founder asked for Hugging Face to be drilled down further).
const FAM2_LABEL = {
  qwen: 'Qwen',
  llama: 'Llama',
  gemma: 'Gemma',
  deepseek: 'DeepSeek',
  'other-open': 'Other open models',
  unknown: 'Unresolved family',
};
const SDK_LABEL = { static: 'Static', gradio: 'Gradio', docker: 'Docker', streamlit: 'Streamlit', unknown: 'Unresolved' };
const TECH_LABEL = {
  'vision-language': 'Vision-language',
  agentic: 'Agentic',
  multimodal: 'Multimodal',
  diffusion: 'Diffusion',
  'tool-use': 'Tool use',
  'fine-tuned': 'Fine-tuned',
};
const VERT_LABEL = {
  'media-entertainment': 'Media & entertainment',
  consumer: 'Consumer',
  education: 'Education',
  'scientific-research': 'Scientific research',
  'enterprise-productivity': 'Enterprise productivity',
  healthcare: 'Healthcare',
};
const ENG_LABEL = { model_downloads: 'Model downloads', model_likes: 'Model likes', space_likes: 'Space likes' };

const frac = (changePct) => (changePct == null || !Number.isFinite(changePct) ? null : changePct / 100);

// Robust-z over a set of fractional changes → flags the use-cases diverging from the pack.
function zScorer(values) {
  const xs = values.filter((v) => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (xs.length < 3) return () => 0;
  const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  const dev = xs.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = dev.length % 2 ? dev[(dev.length - 1) / 2] : (dev[dev.length / 2 - 1] + dev[dev.length / 2]) / 2;
  const scale = 1.4826 * mad;
  return (v) => (v == null || !scale ? 0 : (v - med) / scale);
}

const factBy = (entry, pred) => (entry?.facts || []).find(pred);
const spacesTotalFact = (entry) =>
  factBy(entry, (f) => f.cut === 'sdk_distribution' && f.dimension == null) ||
  factBy(entry, (f) => String(f.what || '').toLowerCase().includes('new spaces in total'));

function viewFrom(entry, comparison, label, labelOf, prevLabelOf) {
  if (!entry) return unavailable(comparison, label, 'No data for this window yet.');
  const total = spacesTotalFact(entry);
  if (!total || total.value == null) return unavailable(comparison, label, 'No data for this window yet.');

  const uc = (entry.facts || []).filter((f) => f.cut === 'spaces_by_use_case' && f.dimension);
  const zOf = zScorer(uc.map((f) => frac(f.changePct)));
  const rows = uc
    .map((f) => {
      const cp = frac(f.changePct);
      return {
        label: UC_LABEL[f.dimension] || f.dimension,
        thisValue: f.value ?? null,
        lastValue: f.prev ?? null,
        changePct: cp,
        direction: directionOf(cp),
        bigMove: cp != null && Math.abs(zOf(cp)) >= 1.5,
      };
    })
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const cp = frac(total.changePct);
  const top = rows.filter((r) => r.label !== 'Other / mixed')[0];
  const summary =
    cp != null
      ? `${cap(label)}-on-${label.toLowerCase()} new Spaces ${cp >= 0 ? 'up' : 'down'} ${Math.abs(cp * 100).toFixed(
          1
        )}% to ${fmtInt(total.value)}${top ? `; ${top.label.toLowerCase()} leads the build mix at ${fmtInt(top.thisValue)} new Spaces` : ''}.`
      : undefined;

  return {
    comparison,
    label,
    available: cp != null,
    thisPeriodLabel: labelOf(entry.periodKey),
    lastPeriodLabel: prevLabelOf ? prevLabelOf(entry.periodKey) : '',
    thisValue: total.value ?? null,
    lastValue: total.prev ?? null,
    changePct: cp,
    direction: directionOf(cp),
    bigMove: cp != null && Math.abs(cp) >= 0.5,
    breakdown: rows,
    summary,
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
const fmtInt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));

// WoW periodKey is a week-start date "2026-10-05"; MoM is "2026-09".
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekLabel = (k) => {
  const d = new Date(`${k}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return k;
  return `wk ${d.getUTCDate()} ${M3[d.getUTCMonth()]}`;
};
const prevWeekLabel = (k) => {
  const d = new Date(`${k}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - 7);
  return `wk ${d.getUTCDate()} ${M3[d.getUTCMonth()]}`;
};
const prevMonthLabel = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${M3[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
};

function buildInsights(month, weeks = []) {
  if (!month) return [];
  const out = [];
  const models = factBy(month, (f) => f.cut === 'models_by_family' && f.dimension == null);

  // 1) the month in one line (lifted narrative) + the models headline
  if (month.narrative) {
    out.push({
      title: 'The month in one line',
      body:
        month.narrative.trim() +
        (models && models.value != null
          ? ` New models totalled ${fmtInt(models.value)}${
              models.changePct != null ? ` (${models.changePct >= 0 ? '+' : ''}${models.changePct.toFixed(0)}% MoM)` : ''
            }.`
          : ''),
      asOf: month.generatedAt,
    });
  }

  // 2) model-family shifts — the divergent story inside "new models"
  const fams = (month.facts || [])
    .filter((f) => f.cut === 'models_by_family' && f.dimension && f.dimension !== 'unknown' && f.changePct != null)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 5);
  if (fams.length) {
    out.push({
      title: 'Model-family shifts (new models, MoM)',
      body: 'Which model families saw the most new models published this month.',
      bullets: fams.map(
        (f) => `${famLabel(f.dimension)} ${f.changePct >= 0 ? '+' : ''}${f.changePct.toFixed(0)}% (${fmtInt(f.value)} new)`
      ),
      asOf: month.generatedAt,
    });
  }

  // 3) honest read on the MoM base, with the current weekly pace computed from the latest
  //    four published weeks rather than written in
  const recent = weeks
    .slice(0, 4)
    .map((w) => spacesTotalFact(w)?.value)
    .filter((v) => v != null && Number.isFinite(v));
  const pace =
    recent.length === 4
      ? `new Spaces averaging ~${(recent.reduce((a, b) => a + b, 0) / 4 / 1000).toFixed(1)}k/week over the last four weeks`
      : 'new Spaces week by week';
  out.push({
    title: 'Reading the month-on-month jump',
    body: `August 2026 was Hugging Face’s first full tracked month, so the comparison base is young, and a month holds four or five weeks depending on its Mondays. The Weekly view — ${pace} — is the cleaner read on the current pace; treat the large MoM as base-sensitive.`,
  });
  return out;
}

// ── Deeper breakdowns ──────────────────────────────────────────────────────
// The Hub ships five more cuts per period beyond the use-case split. Surface them as
// supporting tables (counts or shares + the week-on-week move) so Hugging Face carries the
// same depth the founder asked for — SDK mix, technology & vertical penetration, new models
// by family, and Hub-wide engagement.
const toneOf = (c) => (c == null || !Number.isFinite(c) ? undefined : c > 0 ? 'up' : c < 0 ? 'down' : 'flat');
const pctCell = (c) => (c == null || !Number.isFinite(c) ? '—' : `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`);
const ptsCell = (c) => (c == null || !Number.isFinite(c) ? '—' : `${c >= 0 ? '+' : ''}${c.toFixed(2)} pp`);
const compactInt = (n) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : Math.abs(n) >= 1e6
      ? `${(n / 1e6).toFixed(2)}M`
      : Math.round(n).toLocaleString('en-US');

function buildAuxTables(entry) {
  if (!entry) return [];
  const facts = (cut) => (entry.facts || []).filter((f) => f.cut === cut && f.dimension != null && f.value != null);
  const denomOf = (cut) => facts(cut)[0]?.denominator;
  // Sort by size, but keep the catch-all "unresolved" bucket at the bottom so named
  // families / SDKs lead the table.
  const rank = (f) => (f.dimension === 'unknown' ? 1 : 0);
  const byValue = (cut) => facts(cut).slice().sort((a, b) => rank(a) - rank(b) || (b.value ?? 0) - (a.value ?? 0));
  const countRows = (cut, labels) =>
    byValue(cut).map((f) => [
      { text: labels[f.dimension] || f.dimension },
      { text: compactInt(f.value), bold: true },
      { text: pctCell(f.changePct), tone: toneOf(f.changePct) },
    ]);
  const shareRows = (cut, labels) =>
    byValue(cut).map((f) => [
      { text: labels[f.dimension] || f.dimension },
      { text: `${Number(f.value).toFixed(1)}%`, bold: true },
      { text: ptsCell(f.changePts), tone: toneOf(f.changePts) },
    ]);

  const out = [];
  if (facts('sdk_distribution').length)
    out.push({
      title: 'New Spaces by SDK',
      subtitle: `How this week’s ${fmtInt(denomOf('sdk_distribution'))} new Spaces were built.`,
      headers: ['SDK', 'New Spaces', 'WoW'],
      align: ['left', 'right', 'right'],
      rows: countRows('sdk_distribution', SDK_LABEL),
    });
  if (facts('technology_penetration').length)
    out.push({
      title: 'Technology penetration',
      subtitle: 'Share of new Spaces using each technology, with the week-on-week point move.',
      headers: ['Technology', 'Share of Spaces', 'WoW (pp)'],
      align: ['left', 'right', 'right'],
      rows: shareRows('technology_penetration', TECH_LABEL),
    });
  if (facts('vertical_penetration').length)
    out.push({
      title: 'Vertical penetration',
      subtitle: 'Share of new Spaces serving each industry, with the week-on-week point move.',
      headers: ['Vertical', 'Share of Spaces', 'WoW (pp)'],
      align: ['left', 'right', 'right'],
      rows: shareRows('vertical_penetration', VERT_LABEL),
    });
  if (facts('models_by_family').length)
    out.push({
      title: 'New models by family',
      subtitle: `New models published on the Hub this week, by family (of ${fmtInt(denomOf('models_by_family'))}).`,
      headers: ['Model family', 'New models', 'WoW'],
      align: ['left', 'right', 'right'],
      rows: countRows('models_by_family', FAM2_LABEL),
    });
  if (facts('engagement').length)
    out.push({
      title: 'Engagement signals',
      subtitle: 'Hub-wide demand this week — downloads and likes.',
      headers: ['Signal', 'This week', 'WoW'],
      align: ['left', 'right', 'right'],
      rows: countRows('engagement', ENG_LABEL),
    });
  return out;
}

// ── series.json: the gaps insights.json leaves ─────────────────────────────
// series.json carries every published week's value for every cut — the same aggregates the
// insight facts are built from (they agree to the unit). It closes two gaps:
//  1) a week whose insight lost its comparison (every `prev` null — the Hub pipeline ran on a
//     database a week behind, as on 2026-11-23) gets its prior week back from the series,
//     under the Hub's own coverage rule, so the Week view stays a real week-on-week read;
//  2) the month in progress gets a month-to-date column. insights.json only summarises a
//     month once its last week closes, so without this the Month view lags by up to five
//     weeks. MTD uses the Hub's own month rule and compares like-for-like weeks.
// Every series read is optional: if series.json is missing or malformed the card renders
// exactly as it would from insights.json alone.

// The Hub pipeline's own rules (techmuns/huggingface src/lib/insights.ts), so a figure here
// can't disagree with the same figure on the Hub's dashboard.
const NEEDS_COVERAGE = new Set(['spaces_by_use_case', 'share_by_use_case', 'technology_penetration', 'vertical_penetration']);
const MIN_COVERAGE = 40; // % of a period's new Spaces the classifier reached
const MAX_COVERAGE_GAP = 10; // points between two periods before their use-case mix is comparable
const MIN_DENOMINATOR = 30; // a share over fewer Spaces than this isn't reported
const TOP_N = 6; // rows per cut, as the insight packs carry
// Counts add, shares pool by their own bases, levels take the last week.
const KIND = { engagement: 'level', technology_penetration: 'percent', vertical_penetration: 'percent', share_by_use_case: 'percent' };
const kindOf = (cut) => KIND[cut] ?? 'count';

const DAY_MS = 86400000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const weekBefore = (k) => isoDay(Date.parse(`${k}T00:00:00Z`) - 7 * DAY_MS);
const monthKeyBefore = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  return isoDay(Date.UTC(y, m - 2, 1)).slice(0, 7);
};
/** Every Monday that belongs to a month — the Hub buckets a week into the month its Monday is in. */
function mondaysOfMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return [];
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const out = [];
  while (d.getUTCMonth() === m - 1) {
    out.push(isoDay(d.getTime()));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function indexSeries(sx) {
  if (!sx || !Array.isArray(sx.weeks) || !Array.isArray(sx.series) || !sx.weeks.length) return null;
  const at = new Map(sx.weeks.map((w, i) => [w, i]));
  const rows = sx.series.filter((s) => s && !s.subDimension && Array.isArray(s.values)); // first axis only
  const byKey = new Map(rows.map((s) => [`${s.cut}|${s.dimension}`, s]));
  const ofCut = (cut) => rows.filter((s) => s.cut === cut);
  const num = (v) => v != null && Number.isFinite(v);
  const sumCut = (cut, idxs, field = 'values') => {
    const rs = ofCut(cut);
    if (!rs.length || !idxs.length) return null;
    let t = 0;
    for (const i of idxs) for (const r of rs) {
      const v = r[field]?.[i];
      if (!num(v)) return null;
      t += v;
    }
    return t;
  };
  // Every new Space has exactly one SDK row, so the SDK cut sums to the period's new Spaces —
  // the figure insights.json reports as "new Spaces in total".
  const spaces = (idxs) => sumCut('sdk_distribution', idxs);
  // Every model row carries the period's model total as its denominator.
  const models = (idxs) => {
    const r = ofCut('models_by_family')[0];
    if (!r) return null;
    let t = 0;
    for (const i of idxs) {
      if (!num(r.denominators?.[i])) return null;
      t += r.denominators[i];
    }
    return t;
  };
  const coverage = (idxs) => {
    const n = spaces(idxs);
    const c = sumCut('spaces_by_use_case', idxs);
    return n > 0 && c != null ? (c / n) * 100 : null;
  };
  /** One cut/dimension over a window of week indexes, combined by the cut's kind. */
  const value = (cut, dim, idxs) => {
    if (!idxs.length) return null;
    if (dim == null) return cut === 'sdk_distribution' ? spaces(idxs) : cut === 'models_by_family' ? models(idxs) : null;
    const s = byKey.get(`${cut}|${dim}`);
    if (!s || idxs.every((i) => s.suppressed?.[i])) return null;
    const vals = idxs.map((i) => s.values[i]);
    if (!vals.every(num)) return null;
    const kind = kindOf(cut);
    if (kind === 'level') return vals[vals.length - 1];
    if (kind === 'percent') {
      let n = 0;
      let d = 0;
      idxs.forEach((i, k) => {
        const w = s.denominators?.[i];
        if (num(w) && w > 0) {
          n += vals[k] * w;
          d += w;
        }
      });
      return d > 0 ? n / d : null;
    }
    return vals.reduce((a, b) => a + b, 0);
  };
  const denominator = (cut, dim, idxs) => {
    const s = byKey.get(`${cut}|${dim}`);
    if (!s) return null;
    let t = 0;
    for (const i of idxs) {
      if (!num(s.denominators?.[i])) return null;
      t += s.denominators[i];
    }
    return t;
  };
  return { weeks: sx.weeks.slice(), at, ofCut, spaces, coverage, value, denominator };
}

const comparableCoverage = (a, b) =>
  a != null && b != null && a >= MIN_COVERAGE && b >= MIN_COVERAGE && Math.abs(a - b) <= MAX_COVERAGE_GAP;
const sameNumber = (a, b) => a != null && b != null && Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-6);

/** Fill each fact's missing prior from the series, `now`/`prev` being week-index windows.
 *  Only where the series reproduces the fact's own value for `now` (so both describe the same
 *  thing), and — for classifier-derived cuts — only when the two windows were classified to a
 *  comparable depth. A fact that already has its prior is left exactly as published. */
function fillFacts(facts, X, now, prev) {
  const comparable = comparableCoverage(X.coverage(now), X.coverage(prev));
  return facts.map((f) => {
    if (f.prev != null || f.value == null || !f.cut) return f;
    if (NEEDS_COVERAGE.has(f.cut) && !comparable) return f;
    if (!sameNumber(X.value(f.cut, f.dimension ?? null, now), f.value)) return f;
    const p = X.value(f.cut, f.dimension ?? null, prev);
    if (p == null) return f;
    return {
      ...f,
      prev: p,
      changePct: p ? ((f.value - p) / p) * 100 : null,
      changePts: f.unit === 'percent' ? f.value - p : null,
    };
  });
}

/** A week's insight entry with any lost week-on-week comparison restored from the series. */
function fillWeek(entry, X) {
  if (!X || !entry || !Array.isArray(entry.facts)) return entry;
  const i = X.at.get(entry.periodKey);
  const p = X.at.get(weekBefore(entry.periodKey));
  if (i == null || p == null) return entry;
  return { ...entry, facts: fillFacts(entry.facts, X, [i], [p]) };
}

/** The facts an insight pack would carry for a window, built from the series: totals plus
 *  the top rows of each cut, with the Hub's coverage and size floors applied. */
function factsFromSeries(X, idxs) {
  const total = X.spaces(idxs);
  if (total == null || total <= 0) return [];
  const blank = { prev: null, changePct: null, changePts: null };
  const facts = [{ cut: 'sdk_distribution', dimension: null, unit: 'count', value: total, denominator: null, ...blank }];
  const models = X.value('models_by_family', null, idxs);
  if (models != null) facts.push({ cut: 'models_by_family', dimension: null, unit: 'count', value: models, denominator: null, ...blank });
  const classifiable = (X.coverage(idxs) ?? 0) >= MIN_COVERAGE;
  for (const cut of ['spaces_by_use_case', 'models_by_family', 'technology_penetration', 'vertical_penetration', 'sdk_distribution', 'engagement']) {
    if (NEEDS_COVERAGE.has(cut) && !classifiable) continue;
    const percent = kindOf(cut) === 'percent';
    X.ofCut(cut)
      .map((s) => ({ dim: s.dimension, value: X.value(cut, s.dimension, idxs), den: X.denominator(cut, s.dimension, idxs) }))
      .filter((r) => r.value != null && !(percent && (r.den ?? 0) < MIN_DENOMINATOR))
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N)
      .forEach((r) => facts.push({ cut, dimension: r.dim, unit: percent ? 'percent' : 'count', value: r.value, denominator: r.den, ...blank }));
  }
  return facts;
}

/** A week entry for a week the series has published but insights.json hasn't summarised. */
function weekFromSeries(X, key) {
  const i = X.at.get(key);
  if (i == null) return null;
  const facts = factsFromSeries(X, [i]);
  if (!facts.length) return null;
  // The data is complete once the week has closed — the honest "as of" for a figure with no
  // insight timestamp of its own.
  return { kind: 'week', periodKey: key, weekStart: key, generatedAt: isoDay(Date.parse(`${key}T00:00:00Z`) + 7 * DAY_MS), facts };
}

/** Month-to-date for the month the newest published week belongs to, when insights.json
 *  hasn't summarised that month yet. Weeks 1..n of the month (by the Hub's Monday rule) are
 *  compared with weeks 1..n of the month before — like-for-like, never against a full month. */
function monthToDate(X, months) {
  const newest = X.weeks[X.weeks.length - 1];
  const key = newest.slice(0, 7);
  if (months.some((m) => String(m.periodKey) >= key)) return null;
  const mondays = mondaysOfMonth(key);
  let n = 0;
  while (n < mondays.length && X.at.has(mondays[n])) n++;
  if (!n) return null;
  const complete = n === mondays.length;
  const prevKey = monthKeyBefore(key);
  const prevAll = mondaysOfMonth(prevKey);
  const prevWeeks = complete ? prevAll : prevAll.slice(0, n);
  const now = mondays.slice(0, n).map((w) => X.at.get(w));
  const facts = factsFromSeries(X, now);
  if (!facts.length) return null;
  const prevOk = prevWeeks.length === (complete ? prevAll.length : n) && prevWeeks.every((w) => X.at.has(w));
  const prevIdx = prevOk ? prevWeeks.map((w) => X.at.get(w)) : null;
  return {
    kind: 'month',
    periodKey: key,
    prevKey,
    complete,
    weeksIn: n,
    weeksOf: mondays.length,
    firstWeek: mondays[0],
    lastWeek: mondays[n - 1],
    prevTotal: prevIdx ? X.spaces(prevIdx) : null,
    generatedAt: isoDay(Date.parse(`${mondays[n - 1]}T00:00:00Z`) + 7 * DAY_MS),
    facts: prevIdx ? fillFacts(facts, X, now, prevIdx) : facts,
  };
}

/** The Month view's last-N-months table, ending in the month-to-date column. Built by hand,
 *  not with attachSeries: an MTD total is a part-month, so it never "chains" to the full
 *  month before it and attachSeries would blank the earlier months. Each step's change is the
 *  honest one — full month vs full month, and MTD vs the same weeks of the month before. */
function attachMonthSeries(view, closedNewestFirst, changeLabel) {
  const ordered = [...closedNewestFirst.filter((v) => v && v.available).reverse(), view];
  if (ordered.length < 2) return;
  const pt = (v, src) => ({
    label: v.thisPeriodLabel,
    value: src ? src.thisValue ?? null : null,
    changePct: src ? src.changePct ?? null : null,
    changeAbs: null,
    direction: src ? src.direction ?? 'flat' : 'flat',
    // The newest step is MTD vs the same weeks of the month before — say so in its header.
    ...(v === view && changeLabel ? { changeLabel } : {}),
  });
  view.series = ordered.map((v) => pt(v, v));
  for (const r of view.breakdown || []) {
    r.series = ordered.map((v) => pt(v, (v.breakdown || []).find((x) => x.label === r.label)));
  }
}

/** Fill the use-case cells a period's insight left blank — an insight carries only its top
 *  rows, so a use-case that was 7th one week shows an empty cell there — from the series, for
 *  the window of weeks behind each column (`windowOf(label)` → week indexes). A value wherever
 *  the series has one; a change only between two full adjacent windows classified alike, and
 *  never into a column listed in `keepChange` (whose change is computed on its own basis). */
const UC_DIM = Object.fromEntries(Object.entries(UC_LABEL).map(([d, l]) => [l, d]));
function fillRowGaps(view, X, windowOf, keepChange = new Set()) {
  for (const r of view.breakdown || []) {
    if (!Array.isArray(r.series)) continue;
    const dim = UC_DIM[r.label] ?? r.label;
    r.series.forEach((p, i) => {
      const w = windowOf(p.label);
      if (!w) return;
      if (p.value == null) p.value = X.value('spaces_by_use_case', dim, w);
      if (i === 0 || p.changePct != null || keepChange.has(p.label)) return;
      const prevW = windowOf(r.series[i - 1].label);
      const prev = r.series[i - 1].value;
      if (!prevW || p.value == null || !prev) return;
      if (!comparableCoverage(X.coverage(w), X.coverage(prevW))) return;
      p.changePct = (p.value - prev) / prev;
      p.direction = directionOf(p.changePct);
    });
  }
}

export async function connect(system) {
  const [ins, sx] = await Promise.all([
    getJson(system.source.insights),
    system.source.series ? getJson(system.source.series).catch(() => null) : Promise.resolve(null),
  ]);
  const months = Array.isArray(ins?.month) ? ins.month : [];
  const insightWeeks = Array.isArray(ins?.week) ? ins.week : [];
  if (!months.length) throw new Error('HF insights.json has no monthly entries');
  const X = indexSeries(sx);

  // Weeks newest first: any week the series has published past the newest insight, then the
  // insight weeks — each with a lost week-on-week comparison restored from the series.
  const newerWeeks = X
    ? X.weeks
        .filter((w) => !insightWeeks.length || w > String(insightWeeks[0].periodKey))
        .reverse()
        .map((w) => weekFromSeries(X, w))
        .filter(Boolean)
    : [];
  const weeks = [...newerWeeks, ...insightWeeks].map((w) => fillWeek(w, X));

  const month0 = months[0];
  const week0 = weeks[0];

  const momView = viewFrom(month0, 'MoM', 'Month', monthLabel, prevMonthLabel);
  const wowView = week0
    ? viewFrom(week0, 'WoW', 'Week', weekLabel, prevWeekLabel)
    : unavailable('WoW', 'Week', 'No weekly entry yet.');

  // one period further back (months[1] / weeks[1]), so the headline + table show two
  // consecutive periods of trend. Left unset when that prior entry isn't a valid comparison.
  if (momView.available && months[1]) {
    const momPrior = viewFrom(months[1], 'MoM', 'Month', monthLabel, prevMonthLabel);
    if (momPrior.available) {
      attachPrev(momView.breakdown, momPrior.breakdown);
      momView.prevLabel = momPrior.lastPeriodLabel; // the period before lastPeriodLabel
      momView.prevValue = momPrior.lastValue; // the period before last (oldest total)
      momView.prevChangePct = momPrior.changePct;
      momView.prevDirection = momPrior.direction;
    }
  }
  if (wowView.available && weeks[1]) {
    const wowPrior = viewFrom(weeks[1], 'WoW', 'Week', weekLabel, prevWeekLabel);
    if (wowPrior.available) {
      attachPrev(wowView.breakdown, wowPrior.breakdown);
      wowView.prevLabel = wowPrior.lastPeriodLabel; // the period before lastPeriodLabel
      wowView.prevValue = wowPrior.lastValue;
      wowView.prevChangePct = wowPrior.changePct;
      wowView.prevDirection = wowPrior.direction;
    }
  }
  // Weekly trend: the Hub ships 9+ weeks, so the Weekly view carries a real last-4-weeks
  // series (headline + every use-case), through the most recent week. This is the current
  // pace read and runs well past the monthly base, so it is the default headline below.
  if (wowView.available && weeks.length >= 2) {
    const weekly = weeks.slice(0, 4).map((w) => viewFrom(w, 'WoW', 'Week', weekLabel, prevWeekLabel));
    attachSeries(wowView, weekly);
    if (X) {
      const byLabel = new Map(weeks.slice(0, 4).map((w) => [weekLabel(w.periodKey), X.at.get(w.periodKey)]));
      fillRowGaps(wowView, X, (l) => (byLabel.get(l) != null ? [byLabel.get(l)] : null));
    }
  }
  // Month to date: the month in progress as the Month view's newest column, compared with the
  // same weeks of the month before. The closed months stay exactly as the Hub summarised them.
  let monthView = momView;
  const mtd = X ? monthToDate(X, months) : null;
  if (mtd) {
    const wks = `${mtd.weeksIn} of ${mtd.weeksOf} wks`;
    const thisLbl = mtd.complete ? monthLabel(mtd.periodKey) : `${monthLabel(mtd.periodKey)} MTD (${wks})`;
    const lastLbl = mtd.complete
      ? monthLabel(mtd.prevKey)
      : `${monthLabel(mtd.prevKey)} ${mtd.weeksIn === 1 ? 'wk 1' : `wks 1–${mtd.weeksIn}`}`;
    const v = viewFrom(mtd, 'MoM', 'Month', () => thisLbl, () => lastLbl);
    if (v.available) {
      const top = v.breakdown.filter((r) => r.label !== 'Other / mixed')[0];
      const span = `${weekLabel(mtd.firstWeek)}–${weekLabel(mtd.lastWeek).replace(/^wk /, '')}`;
      v.summary = mtd.complete
        ? v.summary
        : `${monthLabel(mtd.periodKey)} month to date (${wks}, ${span}): ${fmtInt(v.thisValue)} new Spaces, ` +
          `${v.changePct >= 0 ? 'up' : 'down'} ${Math.abs(v.changePct * 100).toFixed(1)}% on the same ${mtd.weeksIn} ` +
          `week${mtd.weeksIn === 1 ? '' : 's'} of ${monthLabel(mtd.prevKey)} (${fmtInt(v.lastValue)})` +
          `${top ? `; ${top.label.toLowerCase()} leads the build mix at ${fmtInt(top.thisValue)}` : ''}. ` +
          `Month-to-date moves compare like-for-like weeks, never a part-month with a full one; ` +
          `the full-month columns are the Hub's own monthly figures.`;
      const closed = months.slice(0, 3).map((m) => viewFrom(m, 'MoM', 'Month', monthLabel, prevMonthLabel));
      attachMonthSeries(v, closed, mtd.complete ? undefined : `${lastLbl} → ${monthLabel(mtd.periodKey)} MTD`);
      // Each column's weeks, by the Hub's Monday rule: a closed month only if the series
      // holds every one of its weeks; the MTD column is weeks 1..n.
      const windows = new Map(
        months.slice(0, 3).map((m) => {
          const ws = mondaysOfMonth(m.periodKey);
          return [monthLabel(m.periodKey), ws.every((w) => X.at.has(w)) ? ws.map((w) => X.at.get(w)) : null];
        })
      );
      windows.set(thisLbl, mondaysOfMonth(mtd.periodKey).slice(0, mtd.weeksIn).map((w) => X.at.get(w)));
      fillRowGaps(v, X, (l) => windows.get(l) ?? null, new Set([thisLbl]));
      monthView = v;
    }
  }

  const qoqView = unavailable(
    'QoQ',
    'Quarter',
    'Hugging Face tracking started in late July 2026 — a quarter-on-quarter needs two full quarters, so it is not available yet.'
  );
  const views = [wowView, monthView, qoqView];
  // Weekly is the default: it is the freshest window (runs through the latest week, well past
  // the month) and the cleaner current-pace read — the monthly base is still young. MoM stays
  // one toggle away for the headline monthly figure.
  const def = wowView.available ? wowView : monthView.available ? monthView : views[0];

  const asOf = week0?.generatedAt || month0.generatedAt || `${month0.periodKey}-28`;
  const block = makeBlock(system, {
    unit: 'new Spaces',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: def.changePct,
    direction: def.direction,
    asOf,
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      'New AI Spaces published on the Hugging Face Hub, from the Hub’s own insights feed (authoritative value/prev per period), with its weekly series filling any week the feed hasn’t compared yet. Weeks run Monday–Sunday and publish once closed. The Month view ends in the month to date, compared with the same weeks of the month before; a week belongs to the month its Monday falls in. Headline breakdown is new Spaces by use-case; the supporting tables add the SDK mix, technology & vertical penetration, new models by family, and Hub-wide engagement. Quarter-on-quarter needs two full quarters — not available yet.',
  });
  block.views = views;
  block.breakdownNoun = 'use-case';
  block.changeNoun = 'New Spaces change';
  block.insights = buildInsights(month0, weeks);
  // Deeper breakdowns (SDK, technology, vertical, model family, engagement) from the freshest
  // weekly entry — surfaced as supporting tables on the dashboard and in the newsletter.
  block.auxTables = buildAuxTables(week0 || month0);
  return block;
}
