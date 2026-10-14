// AI Model Intelligence — OpenRouter model token usage rolled to complete quarters (QoQ),
// plus Gemini rank (snapshot), Alphabet search-rev growth (SEC), and AI app-download share (UBS).
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

const PROV_LABEL = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  'z-ai': 'Z.ai',
  stepfun: 'StepFun',
  xiaomi: 'Xiaomi',
  tencent: 'Tencent',
  nvidia: 'Nvidia',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  others: 'Others',
};
const plabel = (p) => PROV_LABEL[p] || p;

export async function connect(system) {
  const usage = await getJson(system.source.usage);
  const weeks = usage?.weeks || [];
  if (weeks.length < 2) throw new Error('no usage weeks');

  const sumQ = {};
  const cntQ = {};
  const provQ = {};
  for (const w of weeks) {
    const q = quarterOf(w.start);
    sumQ[q] = (sumQ[q] || 0) + (w.totalRaw || 0);
    cntQ[q] = (cntQ[q] || 0) + 1;
    provQ[q] = provQ[q] || {};
    const pv = w.providers;
    const entries = Array.isArray(pv)
      ? pv.map((e) => (Array.isArray(e) ? e : [e.name, e.value]))
      : pv && typeof pv === 'object'
        ? Object.entries(pv)
        : [];
    for (const [name, val] of entries) {
      provQ[q][name] = (provQ[q][name] || 0) + (val || 0);
    }
  }
  const completeQs = Object.keys(sumQ)
    .filter((q) => cntQ[q] >= 12)
    .sort();
  const thisQ = completeQs[completeQs.length - 1];
  const lastQ = completeQs[completeQs.length - 2];
  if (!thisQ || !lastQ) throw new Error('need two complete quarters of usage');

  const breakdown = Object.keys(provQ[thisQ] || {})
    .map((p) => {
      const tv = provQ[thisQ][p] || 0;
      const lv = provQ[lastQ]?.[p] ?? null;
      return { label: plabel(p), thisValue: tv, lastValue: lv, changePct: pctChange(tv, lv), direction: directionOf(pctChange(tv, lv)) };
    })
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const trend = completeQs.slice(-6).map((q) => ({ period: quarterLabel(q), value: sumQ[q] }));

  const secondary = [];
  const snap = await getJson(system.source.snapshot).catch(() => null);
  const gh = snap?.summary?.geminiHighest;
  if (gh?.rank != null) {
    secondary.push(
      makeBlock(system, {
        metricLabel: 'Gemini best rank (snapshot)',
        unit: 'rank',
        comparison: 'QoQ',
        thisPeriodLabel: 'snapshot',
        lastPeriodLabel: '—',
        thisValue: gh.rank,
        lastValue: null,
        changePct: null,
        direction: 'flat',
        asOf: snap.scrapedAt || new Date().toISOString(),
        breakdown: [],
        notes: `Highest-ranked Gemini model on OpenRouter: ${gh.model} (point-in-time snapshot, not a period change).`,
      })
    );
  }
  const fil = await getJson(system.source.filings).catch(() => null);
  if (fil?.searchRevenueGrowth) {
    const g = parseFloat(String(fil.searchRevenueGrowth).replace(/[%+]/g, ''));
    if (Number.isFinite(g)) {
      secondary.push(
        makeBlock(system, {
          metricLabel: 'Alphabet search revenue (YoY)',
          unit: '% YoY',
          comparison: 'QoQ',
          thisPeriodLabel: fil.period || 'latest',
          lastPeriodLabel: 'year ago',
          thisValue: g,
          lastValue: null,
          changePct: null,
          changeAbs: null,
          direction: directionOf(g),
          asOf: fil.fetchedAt || new Date().toISOString(),
          breakdown: [],
          notes: `Reported in Alphabet ${fil.period || ''} results (${fil.searchRevenueGrowth} YoY).`,
        })
      );
    }
  }
  const ubs = await getJson(system.source.ubs).catch(() => null);
  if (ubs?.series) {
    const pick = (app) => ubs.series.find((s) => s.app === app);
    const qmean = (pts, q) => {
      const vals = (pts || []).filter((p) => quarterOf(p.snapshot_date) === q).map((p) => p.value);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const cg = pick('ChatGPT');
    const gm = pick('Gemini');
    if (cg) {
      const qs = [...new Set(cg.points.map((p) => quarterOf(p.snapshot_date)))].sort();
      const tQ = qs[qs.length - 1];
      const lQ = qs[qs.length - 2];
      const cgT = qmean(cg.points, tQ);
      const cgL = qmean(cg.points, lQ);
      const bd = [];
      for (const [nm, s] of [['ChatGPT', cg], ['Gemini', gm]]) {
        if (!s) continue;
        const t = qmean(s.points, tQ);
        const l = qmean(s.points, lQ);
        bd.push({ label: nm, thisValue: t != null ? t * 100 : null, lastValue: l != null ? l * 100 : null, changePct: pctChange(t, l), direction: directionOf(pctChange(t, l)) });
      }
      secondary.push(
        makeBlock(system, {
          metricLabel: 'AI app download share — ChatGPT',
          unit: '% share',
          comparison: 'QoQ',
          thisPeriodLabel: quarterLabel(tQ),
          lastPeriodLabel: quarterLabel(lQ),
          thisValue: cgT != null ? cgT * 100 : null,
          lastValue: cgL != null ? cgL * 100 : null,
          changePct: pctChange(cgT, cgL),
          changeAbs: cgT != null && cgL != null ? Math.round((cgT - cgL) * 1000) / 10 : null,
          direction: directionOf(cgT != null && cgL != null ? cgT - cgL : null),
          asOf: ubs.fetchedAt || new Date().toISOString(),
          breakdown: bd,
          notes: 'Global AI-app download share (UBS Evidence Lab), quarterly mean of weekly snapshots.',
        })
      );
    }
  }

  return makeBlock(system, {
    unit: 'tokens',
    comparison: 'QoQ',
    thisPeriodLabel: quarterLabel(thisQ),
    lastPeriodLabel: quarterLabel(lastQ),
    thisValue: sumQ[thisQ],
    lastValue: sumQ[lastQ],
    changePct: pctChange(sumQ[thisQ], sumQ[lastQ]),
    asOf: usage.updatedAt || new Date().toISOString(),
    breakdown,
    trend,
    secondaryMetrics: secondary,
    notes: 'OpenRouter model token volume, weekly data rolled to complete quarters. AI-crawler share omitted (Cloudflare Radar token is down).',
  });
}
