// 13F Fund Holdings — the client's watchlist funds, QoQ new buys from SEC 13F filings.
// manifest -> buildId; watchlist .mjs -> CLIENT_WATCHLIST CIKs; per CIK summary.json -> series.
import { getJson, getText } from '../lib/http.mjs';
import { quarterOf, quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

const FALLBACK = [
  { cik: '0001067983', label: 'Berkshire Hathaway' },
  { cik: '0001423053', label: 'Citadel' },
];

function parseWatchlist(txt) {
  const start = txt.indexOf('CLIENT_WATCHLIST');
  if (start < 0) return null;
  const block = txt.slice(start, txt.indexOf('];', start));
  const entries = [...block.matchAll(/\{\s*cik:\s*"(\d+)"[^}]*?label:\s*"([^"]+)"/g)].map((m) => ({
    cik: m[1],
    label: m[2],
  }));
  return entries.length ? entries : null;
}

const mode = (arr) => {
  const c = {};
  let best = arr[0];
  let bn = 0;
  for (const x of arr) {
    c[x] = (c[x] || 0) + 1;
    if (c[x] > bn) {
      bn = c[x];
      best = x;
    }
  }
  return best;
};

export async function connect(system) {
  const base = system.source.base;
  const manifest = await getJson(`${base}/manifest.json`);
  const buildId = manifest?.buildId;
  if (!buildId) throw new Error('no 13F buildId in manifest');

  let watch = FALLBACK;
  try {
    watch = parseWatchlist(await getText(system.source.watchlist)) || FALLBACK;
  } catch {
    watch = FALLBACK;
  }

  const funds = (
    await Promise.all(
      watch.map(async (w) => {
        try {
          const d = await getJson(`${base}/fund/${w.cik}/summary.json?b=${buildId}`);
          const series = (d?.data?.series || []).slice().sort((a, b) => a.period.localeCompare(b.period));
          if (!series.length) return null;
          return { name: d.name || w.label, series };
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean);

  if (!funds.length) throw new Error('no watchlist fund summaries resolved');

  const thisP = mode(funds.map((f) => f.series[f.series.length - 1].period));
  const priorPeriods = funds.flatMap((f) => f.series.map((s) => s.period)).filter((p) => p < thisP);
  const lastP = priorPeriods.length ? priorPeriods.sort().slice(-1)[0] : null;

  // Apples-to-apples: only funds whose this-quarter row is a clean delta vs a valid
  // prior (priorState PRIOR_OK, deltas not suppressed). Funds mid-restructuring would
  // otherwise inflate the counts.
  const isClean = (f) => {
    const row = f.series.find((s) => s.period === thisP);
    return !!row && row.priorState === 'PRIOR_OK' && row.deltasSuppressed !== true;
  };
  const pool = funds.filter(isClean);
  const usable = pool.length ? pool : funds;

  const at = (f, period, key) => {
    const row = f.series.find((s) => s.period === period);
    return row ? (row[key] ?? null) : null;
  };
  const sumKey = (period, key) =>
    usable.reduce((acc, f) => {
      const v = at(f, period, key);
      return v == null ? acc : acc + v;
    }, 0);

  const thisNew = sumKey(thisP, 'n_new');
  const lastNew = lastP ? sumKey(lastP, 'n_new') : null;

  const breakdown = usable
    .map((f) => {
      const tv = at(f, thisP, 'n_new');
      const lv = lastP ? at(f, lastP, 'n_new') : null;
      return { label: f.name, thisValue: tv, lastValue: lv, changePct: pctChange(tv, lv), direction: directionOf(pctChange(tv, lv)) };
    })
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  // secondary metrics: exits QoQ, total reported AUM QoQ
  const secondary = [];
  const thisExit = sumKey(thisP, 'n_exited');
  const lastExit = lastP ? sumKey(lastP, 'n_exited') : null;
  secondary.push(
    makeBlock(system, {
      metricLabel: 'Positions exited',
      unit: 'positions',
      comparison: 'QoQ',
      thisPeriodLabel: quarterLabel(quarterOf(thisP)),
      lastPeriodLabel: lastP ? quarterLabel(quarterOf(lastP)) : '—',
      thisValue: thisExit,
      lastValue: lastExit,
      changePct: pctChange(thisExit, lastExit),
      asOf: thisP,
      breakdown: usable
        .map((f) => {
          const tv = at(f, thisP, 'n_exited');
          const lv = lastP ? at(f, lastP, 'n_exited') : null;
          return { label: f.name, thisValue: tv, lastValue: lv, changePct: pctChange(tv, lv), direction: directionOf(pctChange(tv, lv)) };
        })
        .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0)),
    })
  );
  const thisAum = sumKey(thisP, 'reportedTotalUsd');
  const lastAum = lastP ? sumKey(lastP, 'reportedTotalUsd') : null;
  secondary.push(
    makeBlock(system, {
      metricLabel: 'Total reported holdings',
      unit: '$',
      comparison: 'QoQ',
      thisPeriodLabel: quarterLabel(quarterOf(thisP)),
      lastPeriodLabel: lastP ? quarterLabel(quarterOf(lastP)) : '—',
      thisValue: thisAum,
      lastValue: lastAum,
      changePct: pctChange(thisAum, lastAum),
      asOf: thisP,
      breakdown: [],
    })
  );

  return makeBlock(system, {
    unit: 'positions',
    comparison: 'QoQ',
    thisPeriodLabel: quarterLabel(quarterOf(thisP)),
    lastPeriodLabel: lastP ? quarterLabel(quarterOf(lastP)) : '—',
    thisValue: thisNew,
    lastValue: lastNew,
    changePct: pctChange(thisNew, lastNew),
    asOf: thisP,
    breakdown,
    secondaryMetrics: secondary,
    notes: `New long positions across ${usable.length} funds with comparable filings (clean prior-quarter deltas). Next quarter's 13Fs are due mid-Nov, so this is the latest fully-filed quarter.`,
  });
}
