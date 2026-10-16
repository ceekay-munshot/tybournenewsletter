// 13F Fund Holdings — what the client's watchlist of concentrated managers is doing,
// from SEC 13F filings (quarterly, so QoQ only — Weekly/MoM are honestly unavailable).
// The rebuild is holdings-level, not fund-count-level:
//   • CONSENSUS names — stocks held by 3+ of the watchlist funds, with how many are
//     adding vs trimming and the average weight change (the breakdown + chart).
//   • per-fund weight moves (pp) as the drill-down under each consensus name.
//   • SECTOR flows — net dollars rotated in/out by sector (ex-Nuveen, see below).
//   • entries / exits and the boldest single-fund bets ("Why it moved").
// Nuveen is a large diversified manager (~3,700 positions); per the client it stays IN,
// counted as one fund in the consensus vote, but kept OUT of the dollar/flow totals so its
// mechanical churn doesn't swamp the concentrated managers' conviction signal.
import { getJson, getText } from '../lib/http.mjs';
import { quarterOf, quarterLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const NUVEEN_CIK = '0001871926';
const MIN_CONSENSUS = 3; // held by >=3 watchlist funds
const BIG_PP = 0.75; // a >=0.75pp average weight move on a consensus name is notable
const TOP_N = 14; // consensus names shown in the chart/detail

const FALLBACK = [
  { cik: '0001067983', label: 'Berkshire Hathaway' },
  { cik: '0001061165', label: 'Lone Pine' },
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

// columnar {n, cols, <col>:[...]} -> array of row objects
function parseCols(d) {
  if (!d || !d.n || !Array.isArray(d.cols)) return [];
  const rows = [];
  for (let i = 0; i < d.n; i++) {
    const o = {};
    for (const c of d.cols) o[c] = d[c]?.[i];
    rows.push(o);
  }
  return rows;
}

const BUY = new Set(['NEW', 'ADDED']);
const TRIM = new Set(['TRIMMED']);
const median = (xs) => {
  const a = xs.filter((v) => v != null && Number.isFinite(v)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const fmtUsd = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};
const pp = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}pp`;

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
    changeDisplay: 'pp',
    direction: 'flat',
    breakdown: [],
  };
}

export async function connect(system) {
  const base = system.source.base;
  const manifest = await getJson(`${base}/manifest.json`);
  const buildId = manifest?.buildId;
  if (!buildId) throw new Error('no 13F buildId in manifest');
  const periodsDesc = (manifest.periods || []).map((p) => p.period).sort().reverse();

  let watch = FALLBACK;
  try {
    watch = parseWatchlist(await getText(system.source.watchlist)) || FALLBACK;
  } catch {
    watch = FALLBACK;
  }

  const sectorsDoc = await getJson(`${base}/meta/sectors.json?b=${buildId}`).catch(() => null);
  const SECTOR = sectorsDoc?.data || {};
  const sectorOf = (t) => SECTOR[t] || SECTOR[String(t).replace('.', '-')] || null;

  // 13Fs are due ~45 days after quarter-end, so the latest FULLY-filed quarter is the most
  // recent period-end that is comfortably in the past. Date rule (>=50 days old) avoids the
  // current, barely-filed quarter without trusting any per-fund flag.
  const DAY = 86400000;
  const target =
    periodsDesc.find((p) => Date.now() - new Date(`${p}T00:00:00Z`).getTime() >= 50 * DAY) ||
    periodsDesc[1] ||
    periodsDesc[0];
  const priorPeriod = periodsDesc.filter((p) => p < target)[0] || null;

  // Fetch each watchlist fund's holdings (columnar) + exits for a given quarter.
  const fetchFundsFor = async (period) =>
    (
      await Promise.all(
        watch.map(async (f) => {
          try {
            const h = await getJson(`${base}/fund/${f.cik}/${period}.json`);
            const holdings = parseCols(h?.data).filter((r) => r.ticker);
            const exits = Array.isArray(h?.exits) ? h.exits : [];
            if (!holdings.length && !exits.length) return null;
            return {
              cik: f.cik,
              name: h?.name || f.label,
              holdings,
              exits,
              isNuveen: f.cik === NUVEEN_CIK,
              totalPositions: h?.total ?? holdings.length,
            };
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

  const funds = await fetchFundsFor(target);
  if (!funds.length) throw new Error('no watchlist holdings resolved for the target quarter');
  const nFunds = funds.length;

  // ---- consensus: ticker -> which funds hold it, their action + weight move ----
  const byTicker = new Map();
  for (const f of funds) {
    for (const h of f.holdings) {
      const e = byTicker.get(h.ticker) || { ticker: h.ticker, name: h.name, sector: sectorOf(h.ticker), holders: [] };
      e.holders.push({ fund: f.name, action: h.action, dWeightPp: h.dWeightPp ?? null, weight: h.weight ?? null });
      byTicker.set(h.ticker, e);
    }
  }
  const consensus = [...byTicker.values()]
    .filter((e) => e.holders.length >= MIN_CONSENSUS)
    .map((e) => {
      const adds = e.holders.filter((h) => BUY.has(h.action)).length;
      const trims = e.holders.filter((h) => TRIM.has(h.action)).length;
      const avgPp = median(e.holders.map((h) => h.dWeightPp).filter((v) => v != null));
      return { ...e, n: e.holders.length, adds, trims, avgPp: avgPp ?? 0 };
    })
    .sort((a, b) => b.n - a.n || Math.abs(b.avgPp) - Math.abs(a.avgPp));

  // headline = the average weight move across every concentrated-manager position in a
  // consensus name (ex-Nuveen) — a Nuveen-robust read on whether these shared high-conviction
  // names are, on balance, being added to or trimmed this quarter.
  const consensusTickers = new Set(consensus.map((c) => c.ticker));
  const convPps = [];
  for (const f of funds) {
    if (f.isNuveen) continue;
    for (const h of f.holdings) {
      if (consensusTickers.has(h.ticker) && h.dWeightPp != null) convPps.push(h.dWeightPp);
    }
  }
  const headlinePp = convPps.length
    ? convPps.reduce((a, b) => a + b, 0) / convPps.length
    : median(consensus.map((c) => c.avgPp));

  // ---- prior quarter (one step back) for the two-period trend ----
  // The target quarter's holdings carry dWeightPp = prior→target move; the quarter BEFORE
  // carries dWeightPp = prior-prior→prior. Fetch it so each consensus name and each fund
  // shows its move in both quarters.
  const prevPeriod = priorPeriod ? periodsDesc.filter((p) => p < priorPeriod)[0] || null : null;
  const priorByTicker = new Map();
  let priorHeadlinePp = null;
  if (priorPeriod) {
    const priorFunds = await fetchFundsFor(priorPeriod);
    for (const f of priorFunds) {
      for (const h of f.holdings) {
        if (h.dWeightPp == null) continue;
        const e = priorByTicker.get(h.ticker) || { vals: [], perFund: new Map() };
        e.vals.push(h.dWeightPp);
        e.perFund.set(f.name, h.dWeightPp);
        priorByTicker.set(h.ticker, e);
      }
    }
    const pp = [];
    for (const f of priorFunds) {
      if (f.isNuveen) continue;
      for (const h of f.holdings) if (consensusTickers.has(h.ticker) && h.dWeightPp != null) pp.push(h.dWeightPp);
    }
    priorHeadlinePp = pp.length ? pp.reduce((a, b) => a + b, 0) / pp.length : null;
  }

  const breakdown = consensus.slice(0, TOP_N).map((c) => {
    const prior = priorByTicker.get(c.ticker);
    const prevAvg = prior && prior.vals.length ? median(prior.vals) : null;
    const subs = c.holders
      .filter((h) => h.dWeightPp != null)
      .sort((a, b) => Math.abs(b.dWeightPp) - Math.abs(a.dWeightPp))
      .slice(0, 6)
      .map((h) => {
        const pv = prior?.perFund.get(h.fund);
        return {
          label: h.fund,
          thisValue: null,
          lastValue: null,
          changePct: null,
          changeAbs: h.dWeightPp,
          changeDisplay: 'pp',
          direction: directionOf(h.dWeightPp),
          prevChangeAbs: pv ?? null,
          prevDirection: directionOf(pv ?? null),
        };
      });
    return {
      label: c.ticker,
      thisValue: null,
      lastValue: null,
      changePct: null,
      changeAbs: c.avgPp,
      changeDisplay: 'pp',
      direction: directionOf(c.avgPp),
      prevChangeAbs: prevAvg,
      prevDirection: directionOf(prevAvg),
      bigMove: Math.abs(c.avgPp) >= BIG_PP || (c.n >= 5 && (c.trims === c.n || c.adds === c.n)),
      note: `${c.n} funds · ${c.adds} adding / ${c.trims} trimming${c.sector ? ` · ${c.sector}` : ''}`,
      sub: subs,
    };
  });

  // ---- sector $ flows (ex-Nuveen, to isolate the concentrated managers' rotation) ----
  const secFlow = new Map();
  for (const f of funds) {
    if (f.isNuveen) continue;
    for (const h of f.holdings) {
      const s = sectorOf(h.ticker);
      if (!s || h.dValue == null) continue;
      secFlow.set(s, (secFlow.get(s) || 0) + h.dValue);
    }
  }
  const sectorRanked = [...secFlow.entries()].map(([s, v]) => ({ s, v })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));

  // ---- boldest single-fund weight moves, new positions, exits (ex-Nuveen) ----
  const moves = [];
  const entries = [];
  const exits = [];
  for (const f of funds) {
    if (f.isNuveen) continue;
    for (const h of f.holdings) {
      if (h.dWeightPp != null) moves.push({ fund: f.name, ticker: h.ticker, pp: h.dWeightPp, action: h.action, weight: h.weight });
      if (h.action === 'NEW') entries.push({ fund: f.name, ticker: h.ticker, weight: h.weight ?? 0 });
    }
    for (const x of f.exits) exits.push({ fund: f.name, ticker: x.ticker, weightPrior: x.weightPrior ?? 0 });
  }
  moves.sort((a, b) => b.pp - a.pp);
  entries.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  exits.sort((a, b) => (b.weightPrior ?? 0) - (a.weightPrior ?? 0));

  // ---- insights ----
  const insights = [];
  const buys = consensus.filter((c) => c.adds > c.trims).sort((a, b) => b.adds - a.adds || b.avgPp - a.avgPp).slice(0, 5);
  const sells = consensus.filter((c) => c.trims > c.adds).sort((a, b) => b.trims - a.trims || a.avgPp - b.avgPp).slice(0, 5);
  if (buys.length) {
    insights.push({
      title: 'Consensus buys — where conviction is building',
      body: 'Names multiple watchlist funds agree on and were net adding to this quarter.',
      bullets: buys.map((c) => `${c.ticker} — ${c.n} funds hold, ${c.adds} adding${c.trims ? ` / ${c.trims} trimming` : ''} (avg ${pp(c.avgPp)})`),
    });
  }
  if (sells.length) {
    insights.push({
      title: 'Consensus sells — where they’re taking money off',
      body: 'Shared names where more funds trimmed or exited than added.',
      bullets: sells.map((c) => `${c.ticker} — ${c.n} funds hold, ${c.trims} trimming${c.adds ? ` / ${c.adds} adding` : ''} (avg ${pp(c.avgPp)})`),
    });
  }
  if (sectorRanked.length) {
    const inn = sectorRanked.filter((x) => x.v > 0).slice(0, 4);
    const out = sectorRanked.filter((x) => x.v < 0).slice(0, 3);
    insights.push({
      title: 'Sector rotation (net $ moved, ex-Nuveen)',
      body: 'Net dollars the concentrated managers put to work or pulled, by sector, from this quarter’s position changes.',
      bullets: [
        inn.length ? `Into: ${inn.map((x) => `${x.s} ${fmtUsd(x.v)}`).join(', ')}` : null,
        out.length ? `Out of: ${out.map((x) => `${x.s} ${fmtUsd(x.v)}`).join(', ')}` : null,
      ].filter(Boolean),
    });
  }
  const bold = moves.slice(0, 4).map((m) => `${m.fund}: ${m.ticker} ${pp(m.pp)}${m.action === 'NEW' ? ' (new)' : ''}`);
  const topEntry = entries.slice(0, 3).map((e) => `${e.fund}: new in ${e.ticker}${e.weight ? ` (${e.weight.toFixed(1)}% wt)` : ''}`);
  const topExit = exits.slice(0, 3).map((e) => `${e.fund}: exited ${e.ticker}${e.weightPrior ? ` (was ${e.weightPrior.toFixed(1)}%)` : ''}`);
  insights.push({
    title: 'Boldest single-fund bets, entries & exits',
    body: 'The biggest conviction moves by any one manager this quarter (ex-Nuveen).',
    bullets: [
      bold.length ? `Boldest adds: ${bold.join('; ')}` : null,
      topEntry.length ? `New positions: ${topEntry.join('; ')}` : null,
      topExit.length ? `Exits: ${topExit.join('; ')}` : null,
    ].filter(Boolean),
  });
  const nuveen = funds.find((f) => f.isNuveen);
  if (nuveen) {
    insights.push({
      title: 'On Nuveen',
      body: `Nuveen is a large diversified manager (~${Number(nuveen.totalPositions || nuveen.holdings.length).toLocaleString('en-US')} positions). Per the client it stays in — it counts as one fund in the consensus vote above — but its mechanical position churn is kept out of the dollar-flow and single-fund-move totals so it doesn't swamp the concentrated managers' signal.`,
    });
  }

  const qoqView = {
    comparison: 'QoQ',
    label: 'Quarter',
    available: headlinePp != null,
    thisPeriodLabel: quarterLabel(quarterOf(target)),
    lastPeriodLabel: priorPeriod ? quarterLabel(quarterOf(priorPeriod)) : '—',
    thisValue: null,
    lastValue: null,
    changePct: null,
    changeAbs: headlinePp,
    changeDisplay: 'pp',
    direction: directionOf(headlinePp),
    bigMove: headlinePp != null && Math.abs(headlinePp) >= 0.3,
    prevLabel: prevPeriod ? quarterLabel(quarterOf(prevPeriod)) : undefined,
    prevChangeAbs: priorHeadlinePp,
    prevDirection: directionOf(priorHeadlinePp),
    breakdown,
    summary: `${consensus.length} names are held by ${MIN_CONSENSUS}+ of the ${nFunds} watchlist funds. On balance those shared positions were ${
      headlinePp == null ? 'little changed' : headlinePp >= 0 ? `added to (typical ${pp(headlinePp)})` : `trimmed (typical ${pp(headlinePp)})`
    } — ${buys.length} building conviction, ${sells.length} being lightened. Most-owned: ${consensus.slice(0, 3).map((c) => `${c.ticker} (${c.n})`).join(', ')}.`,
  };
  const views = [
    unavailable('WoW', 'Week', '13F positions are disclosed quarterly — there is no weekly view.'),
    unavailable('MoM', 'Month', '13F positions are disclosed quarterly — there is no monthly view.'),
    qoqView,
  ];

  const block = makeBlock(system, {
    unit: 'pp',
    metricLabel: 'Consensus weight change',
    comparison: 'QoQ',
    thisPeriodLabel: qoqView.thisPeriodLabel,
    lastPeriodLabel: qoqView.lastPeriodLabel,
    thisValue: null,
    lastValue: null,
    changePct: null,
    changeAbs: headlinePp,
    changeDisplay: 'pp',
    direction: directionOf(headlinePp),
    asOf: target,
    breakdown,
    summary: qoqView.summary,
    notes: `Consensus = held by ${MIN_CONSENSUS}+ of ${nFunds} watchlist funds. Headline = the typical consensus name's weight move (median). Nuveen counts as one fund in the vote but is excluded from dollar-flow / single-fund totals. ${
      priorPeriod ? `${quarterLabel(quarterOf(priorPeriod))} → ${quarterLabel(quarterOf(target))}.` : ''
    } Next quarter's 13Fs are due ~45 days after quarter-end, so this is the latest fully-filed quarter.`,
  });
  block.views = views;
  block.breakdownNoun = 'consensus name';
  block.subNoun = 'fund';
  block.changeNoun = 'Avg weight change';
  block.insights = insights;
  return block;
}
