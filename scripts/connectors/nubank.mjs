// Nubank — Brazil credit-card market share, QoQ (change in percentage points).
// The source dashboard's data lives in TypeScript modules; loans.ts combines the
// Nu_Brazil workbook (datasets.ts) with newer BCB IF.data quarters (ifdata.ts). We
// fetch that module graph, bundle it with esbuild, and read the real series.
import { getText } from '../lib/http.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

const GRAPH = ['loans.ts', 'datasets.ts', 'absolutes.ts', 'ifdata.ts', 'bcb.ts'];
const isQuarter = (p) => /^[1-4]Q\d{2}$/.test(p);

/** latest two quarterly periods of a ChartData series named `name`. */
function lastTwo(chart, name) {
  if (!chart?.periods || !chart?.series) return null;
  const s = chart.series.find((x) => x.name === name);
  if (!s) return null;
  const qi = chart.periods.map((p, i) => (isQuarter(p) ? i : -1)).filter((i) => i >= 0);
  if (qi.length < 2) return null;
  const tIdx = qi[qi.length - 1];
  const lIdx = qi[qi.length - 2];
  return {
    thisPeriod: chart.periods[tIdx],
    lastPeriod: chart.periods[lIdx],
    thisValue: s.values[tIdx] ?? null,
    lastValue: s.values[lIdx] ?? null,
  };
}

const qLabel = (p) => (isQuarter(p) ? `${p.slice(0, 2)} '${p.slice(2)}` : p);

export async function connect(system) {
  const base = system.source.base;
  const dir = await mkdtemp(join(tmpdir(), 'nubank-'));
  try {
    for (const f of GRAPH) {
      try {
        await writeFile(join(dir, f), await getText(`${base}/${f}`));
      } catch {
        /* a missing optional dep is tolerated; esbuild will report if essential */
      }
    }
    await writeFile(
      join(dir, 'index.ts'),
      `export { creditCardShare, unsecuredShare } from './loans';\nexport { peerNpl } from './datasets';\n`
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

    const cc = lastTwo(mod.creditCardShare, 'Nu');
    if (!cc) throw new Error('could not read Nu credit-card share series');
    const changeAbs = cc.thisValue != null && cc.lastValue != null ? Math.round((cc.thisValue - cc.lastValue) * 100) / 100 : null;

    const breakdown = (mod.creditCardShare.series || [])
      .map((s) => {
        const t = lastTwo(mod.creditCardShare, s.name);
        return t ? { label: s.name, thisValue: t.thisValue, lastValue: t.lastValue, changePct: pctChange(t.thisValue, t.lastValue), direction: directionOf(pctChange(t.thisValue, t.lastValue)) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

    const secondary = [];
    const npl = lastTwo(mod.peerNpl, 'Nu');
    if (npl) {
      secondary.push(
        makeBlock(system, {
          metricLabel: 'Nu 90+ day NPL',
          unit: '% NPL',
          comparison: 'QoQ',
          thisPeriodLabel: qLabel(npl.thisPeriod),
          lastPeriodLabel: qLabel(npl.lastPeriod),
          thisValue: npl.thisValue,
          lastValue: npl.lastValue,
          changePct: pctChange(npl.thisValue, npl.lastValue),
          changeAbs: npl.thisValue != null && npl.lastValue != null ? Math.round((npl.thisValue - npl.lastValue) * 100) / 100 : null,
          changeDisplay: 'pp',
          asOf: npl.thisPeriod,
          breakdown: [],
          notes: 'Asset quality: share of the book 90+ days overdue (higher = worse).',
        })
      );
    }
    const uns = lastTwo(mod.unsecuredShare, 'Nu');
    if (uns) {
      secondary.push(
        makeBlock(system, {
          metricLabel: 'Nu unsecured-loan share',
          unit: '% share',
          comparison: 'QoQ',
          thisPeriodLabel: qLabel(uns.thisPeriod),
          lastPeriodLabel: qLabel(uns.lastPeriod),
          thisValue: uns.thisValue,
          lastValue: uns.lastValue,
          changePct: pctChange(uns.thisValue, uns.lastValue),
          changeAbs: uns.thisValue != null && uns.lastValue != null ? Math.round((uns.thisValue - uns.lastValue) * 100) / 100 : null,
          changeDisplay: 'pp',
          asOf: uns.thisPeriod,
          breakdown: [],
        })
      );
    }

    return makeBlock(system, {
      unit: '% share',
      comparison: 'QoQ',
      thisPeriodLabel: qLabel(cc.thisPeriod),
      lastPeriodLabel: qLabel(cc.lastPeriod),
      thisValue: cc.thisValue,
      lastValue: cc.lastValue,
      changePct: pctChange(cc.thisValue, cc.lastValue),
      changeAbs,
      changeDisplay: 'pp',
      asOf: cc.thisPeriod,
      breakdown,
      secondaryMetrics: secondary,
      notes: 'Brazil credit-card market share (%); change shown in percentage points. Nu vs incumbent banks, from BCB IF.data + issuer filings.',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
