// Nubank — Brazil credit-card market share (QoQ, percentage points). The source
// dashboard is workbook-driven: loans.ts combines the client's Nu_Brazil workbook
// (datasets.ts / absolutes.ts) with any newer BCB IF.data quarters (ifdata.ts); the
// workbook wins for quarters it covers, so when the client sends a fresh edition the
// numbers update with no code change. We bundle that module graph with esbuild and read
// the real series. Quarterly data, so QoQ only (WoW/MoM unavailable for the primary
// metric); the macro credit-NPL context IS monthly and is shown month-on-month in the
// "Why it moved" cards, alongside Nu's card TPV share and its asset quality vs peers.
import { getText } from '../lib/http.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeBlock, directionOf, attachPrev, attachSeries } from '../lib/changeBlock.mjs';

const GRAPH = ['loans.ts', 'datasets.ts', 'absolutes.ts', 'ifdata.ts', 'bcb.ts'];
const isQuarter = (p) => /^[1-4]Q\d{2}$/.test(p);
const qLabel = (p) => (isQuarter(p) ? `${p.slice(0, 2)} '${p.slice(2)}` : p);
const pp1 = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}pp`;
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

/** latest two QUARTERLY points of series `name` in a ChartData. */
function lastTwoQ(chart, name, back = 0) {
  if (!chart?.periods || !chart?.series) return null;
  const s = chart.series.find((x) => x.name === name);
  if (!s) return null;
  const qi = chart.periods.map((p, i) => (isQuarter(p) ? i : -1)).filter((i) => i >= 0 && s.values[i] != null);
  if (qi.length < 2 + back) return null;
  const t = qi[qi.length - 1 - back];
  const l = qi[qi.length - 2 - back];
  return { thisPeriod: chart.periods[t], lastPeriod: chart.periods[l], thisValue: s.values[t], lastValue: s.values[l] };
}

/** last N non-null points of series `name` (any cadence). */
function lastN(chart, name, n) {
  const s = chart?.series?.find((x) => x.name === name);
  if (!s) return [];
  return chart.periods.map((p, i) => [p, s.values[i]]).filter(([, v]) => v != null).slice(-n);
}

export async function connect(system) {
  const base = system.source.base;
  const dir = await mkdtemp(join(tmpdir(), 'nubank-'));
  try {
    for (const f of GRAPH) {
      try {
        await writeFile(join(dir, f), await getText(`${base}/${f}`));
      } catch {
        /* a missing optional dep is tolerated; esbuild reports if essential */
      }
    }
    await writeFile(
      join(dir, 'index.ts'),
      `export { creditCardShare } from './loans';\n` +
        `export { tpvShare, peerNpl, WORKBOOK } from './datasets';\n` +
        `export { systemNpl } from './bcb';\n`
    );
    const { build } = await import('esbuild');
    const res = await build({
      entryPoints: [join(dir, 'index.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      write: false,
      logLevel: 'silent',
    });
    const outFile = join(dir, 'bundle.mjs');
    await writeFile(outFile, res.outputFiles[0].text);
    const mod = await import(pathToFileURL(outFile).href);

    // ---- primary: Nu credit-card market share, QoQ (pp) ----
    const cc = lastTwoQ(mod.creditCardShare, 'Nu');
    if (!cc) throw new Error('could not read Nu credit-card share series');
    const headlineAbs = round2(cc.thisValue - cc.lastValue);

    const breakdown = (mod.creditCardShare.series || [])
      .map((s) => {
        const t = lastTwoQ(mod.creditCardShare, s.name);
        if (!t) return null;
        const ca = round2(t.thisValue - t.lastValue);
        return {
          label: s.name,
          thisValue: t.thisValue,
          lastValue: t.lastValue,
          changePct: null,
          changeAbs: ca,
          changeDisplay: 'pp',
          direction: directionOf(ca),
          bigMove: ca != null && Math.abs(ca) >= 0.3,
          note: s.name === 'Nu' ? 'Nubank' : undefined,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

    // Prior comparison: the quarter before (quarter[-2] vs quarter[-3]) per issuer, so the
    // table shows two consecutive quarters of share. attachPrev matches issuers by label.
    const priorBreakdown = (mod.creditCardShare.series || [])
      .map((s) => {
        const t = lastTwoQ(mod.creditCardShare, s.name, 1);
        if (!t) return null;
        const ca = round2(t.thisValue - t.lastValue);
        return { label: s.name, thisValue: t.thisValue, lastValue: t.lastValue, changePct: null, changeAbs: ca, direction: directionOf(ca) };
      })
      .filter(Boolean);
    attachPrev(breakdown, priorBreakdown);
    const ccPrior = lastTwoQ(mod.creditCardShare, 'Nu', 1);

    const gainers = breakdown.filter((r) => r.direction === 'up').length;
    const summary = `Nu holds ${cc.thisValue}% of the Brazilian credit-card market (${qLabel(cc.thisPeriod)}), ${
      headlineAbs >= 0 ? 'up' : 'down'
    } ${pp1(headlineAbs)} on ${qLabel(cc.lastPeriod)} — after climbing from ~13% a year ago. ${gainers} of ${breakdown.length} issuers gained share this quarter.`;

    // ---- insight 1: card TPV share (Nu transacts above its balance weight) ----
    const insights = [];
    const tpv = lastTwoQ(mod.tpvShare, 'Nu');
    const tpvTrend = lastN(mod.tpvShare, 'Nu', 5);
    if (tpv) {
      const gap = round2(tpv.thisValue - cc.thisValue);
      insights.push({
        title: `Card TPV share — Nu at ${tpv.thisValue}% of payment volume`,
        body: `Nu processes ${tpv.thisValue}% of Brazilian card payment volume (${qLabel(tpv.thisPeriod)}, ${pp1(
          round2(tpv.thisValue - tpv.lastValue)
        )} QoQ) — about ${gap >= 0 ? `${gap.toFixed(1)}pp above` : `${Math.abs(gap).toFixed(1)}pp below`} its ${cc.thisValue}% share of card balances. Customers spend heavily on the card even where they carry less revolving balance.`,
        bullets: [`TPV share trend: ${tpvTrend.map(([p, v]) => `${qLabel(p)} ${v}%`).join(' → ')}`],
      });
    }

    // ---- insight 2: Brazil macro credit NPL (BCB, MONTHLY → MoM) ----
    const sn = mod.systemNpl;
    if (sn?.periods?.length) {
      const months = sn.periods;
      const lm = months[months.length - 1];
      const pm = months[months.length - 2];
      const row = (name) => {
        const s = sn.series.find((x) => x.name === name);
        if (!s) return null;
        const t = s.values[months.length - 1];
        const l = s.values[months.length - 2];
        return t == null ? null : { name, t, mom: l != null ? round2(t - l) : null };
      };
      const cardR = row('Credit card loans');
      const rows = ['Credit card loans', 'Personal loans', 'Payroll loans', 'All household loans'].map(row).filter(Boolean);
      insights.push({
        title: `Brazil macro credit NPL — ${lm} (BCB, monthly)`,
        body: `System-wide 90-day arrears, month-on-month. Credit-card NPL ${
          cardR ? `is ${cardR.t}%${cardR.mom != null ? ` (${pp1(cardR.mom)} vs ${pm})` : ''} and ${cardR.mom > 0 ? 'rising' : 'easing'}` : 'is tracked here'
        } — the macro backdrop for Nu's own loss rates.`,
        bullets: rows.map((r) => `${r.name}: ${r.t}%${r.mom != null ? ` (${pp1(r.mom)} MoM)` : ''}`),
        asOf: lm,
      });
    }

    // ---- insight 3: Nu asset quality vs peers ----
    const nuNpl = lastTwoQ(mod.peerNpl, 'Nu');
    if (nuNpl) {
      const peers = (mod.peerNpl.series || [])
        .filter((s) => s.name !== 'Nu')
        .map((s) => {
          const t = lastTwoQ(mod.peerNpl, s.name);
          return t ? `${s.name} ${t.thisValue}%` : null;
        })
        .filter(Boolean);
      insights.push({
        title: `Nu asset quality — 90+ NPL at ${nuNpl.thisValue}%`,
        body: `Nu's non-performing-loan ratio is ${nuNpl.thisValue}% (${qLabel(nuNpl.thisPeriod)}, ${pp1(
          round2(nuNpl.thisValue - nuNpl.lastValue)
        )} QoQ) — structurally higher than the incumbents because Nu lends to a broader, newer-to-credit base. Worth watching as system NPL rises.`,
        bullets: peers.length ? [`Peers (90+ NPL): ${peers.join(', ')}`] : undefined,
      });
    }

    // as-of: the client workbook edition date when available (e.g. "Nu_Brazil.xlsx (08.24.2026)")
    let asOf = cc.thisPeriod;
    const wbm = /\((\d{2})\.(\d{2})\.(\d{4})\)/.exec(String(mod.WORKBOOK || ''));
    if (wbm) asOf = `${wbm[3]}-${wbm[1]}-${wbm[2]}`;

    const qoqView = {
      comparison: 'QoQ',
      label: 'Quarter',
      available: true,
      thisPeriodLabel: qLabel(cc.thisPeriod),
      lastPeriodLabel: qLabel(cc.lastPeriod),
      thisValue: cc.thisValue,
      lastValue: cc.lastValue,
      changePct: null,
      changeAbs: headlineAbs,
      changeDisplay: 'pp',
      direction: directionOf(headlineAbs),
      bigMove: headlineAbs != null && Math.abs(headlineAbs) >= 0.3,
      breakdown,
      summary,
    };
    // prior quarter pp move (quarter[-3] → quarter[-2]) for the headline two-period trend
    if (ccPrior) {
      const prevAbs = round2(ccPrior.thisValue - ccPrior.lastValue);
      qoqView.prevLabel = qLabel(ccPrior.lastPeriod);
      qoqView.prevValue = ccPrior.lastValue;
      qoqView.prevChangePct = null;
      qoqView.prevChangeAbs = prevAbs;
      qoqView.prevDirection = directionOf(prevAbs);
    }

    // ---- last 3 quarters as a series (change-only pp columns) ----
    // Rebuild the full QoQ view at back = 0, 1, 2 (newest first) with the same lastTwoQ
    // logic the headline/breakdown use, then attach. attachSeries matches issuers by label.
    const buildQoQView = (back) => {
      const c = lastTwoQ(mod.creditCardShare, 'Nu', back);
      if (!c) return null;
      const hAbs = round2(c.thisValue - c.lastValue);
      const bd = (mod.creditCardShare.series || [])
        .map((s) => {
          const t = lastTwoQ(mod.creditCardShare, s.name, back);
          if (!t) return null;
          const ca = round2(t.thisValue - t.lastValue);
          return {
            label: s.name,
            thisValue: t.thisValue,
            lastValue: t.lastValue,
            changePct: null,
            changeAbs: ca,
            changeDisplay: 'pp',
            direction: directionOf(ca),
            bigMove: ca != null && Math.abs(ca) >= 0.3,
            note: s.name === 'Nu' ? 'Nubank' : undefined,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));
      return {
        comparison: 'QoQ',
        label: 'Quarter',
        available: true,
        thisPeriodLabel: qLabel(c.thisPeriod),
        lastPeriodLabel: qLabel(c.lastPeriod),
        thisValue: c.thisValue,
        lastValue: c.lastValue,
        changePct: null,
        changeAbs: hAbs,
        changeDisplay: 'pp',
        direction: directionOf(hAbs),
        bigMove: hAbs != null && Math.abs(hAbs) >= 0.3,
        breakdown: bd,
      };
    };
    attachSeries(qoqView, [buildQoQView(0), buildQoQView(1), buildQoQView(2)]);

    const unavailable = (comparison, label) => ({
      comparison,
      label,
      available: false,
      unavailableReason: 'Nu and the Brazilian banks report card share quarterly — the monthly macro NPL is in “Why it moved”.',
      thisPeriodLabel: '—',
      lastPeriodLabel: '—',
      thisValue: null,
      lastValue: null,
      changePct: null,
      changeAbs: null,
      changeDisplay: 'pp',
      direction: 'flat',
      breakdown: [],
    });
    const views = [unavailable('WoW', 'Week'), unavailable('MoM', 'Month'), qoqView];

    const block = makeBlock(system, {
      metricLabel: 'Brazil card market share',
      unit: '% share',
      comparison: 'QoQ',
      thisPeriodLabel: qLabel(cc.thisPeriod),
      lastPeriodLabel: qLabel(cc.lastPeriod),
      thisValue: cc.thisValue,
      lastValue: cc.lastValue,
      changePct: null,
      changeAbs: headlineAbs,
      changeDisplay: 'pp',
      direction: directionOf(headlineAbs),
      asOf,
      breakdown,
      summary,
      notes:
        'Brazil credit-card market share (%), change in percentage points, from the client Nu_Brazil workbook + BCB IF.data. Quarterly — card share, TPV share and peer NPL are QoQ; the system-wide macro NPL is monthly (shown MoM). Updates when the client sends a fresh workbook.',
    });
    block.views = views;
    block.breakdownNoun = 'issuer';
    block.changeNoun = 'Share change';
    block.insights = insights;
    return block;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
