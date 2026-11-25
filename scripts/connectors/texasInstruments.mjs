// Texas Instruments Prices — from the source dashboard's "UBS Compare" trend engine
// (?weighted=1&lfl=1 — stock-weighted ASP with a constant-basket like-for-like overlay).
// The founder wants the UBS-Compare view by default: each category / subcategory's price
// MOVE per period, with a toggle to see the underlying PRICE INDEX level instead. Both are
// shown as a matrix of category→subcategory rows × the last few periods, for MoM and QoQ.
import { getJson } from '../lib/http.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const N_PERIODS = 4; // last 3-4 periods as columns (founder: enough to read the trend)
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// "QTD · Q4-26" -> "Q4-26 QTD"; "MTD · Nov-26" -> "Nov-26 MTD"; "Q3-26" -> "Q3-26".
// The to-date tag comes from the source label itself, so a month row never reads "QTD".
const tidy = (label) => {
  const s = String(label);
  if (!s.includes('·')) return s;
  const [tag, period] = s.split('·').map((x) => x.trim());
  return `${period} ${tag || 'to date'}`;
};

// "2026-10-04" -> "4 Oct 2026"
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso);
};

/** Build a category→subcategory × last-N-periods matrix as an AuxTable.
 *  metric 'pct' = each period's % move (UBS Compare); 'index' = a price index rebased to
 *  100 at the end of the period before the first column, chained from those same % moves.
 *  (The source's own `index` field mixes units across the May-2026 data handoff — e.g. LDO
 *  106.2 → 5.5 — and does not move with later periods, so it can't be shown as a level.) */
function buildMatrix(data, metric) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const cols = Array.isArray(data?.columns) ? data.columns : [];
  if (!rows.length || !cols.length) return null;

  const periods = rows.slice(-N_PERIODS);
  const periodLabels = periods.map((p) => tidy(p.label));
  const baseRow = rows.length > N_PERIODS ? rows[rows.length - N_PERIODS - 1] : null;

  // group columns by category, preserving source order; skip the overall "Averages" column.
  const groups = [];
  const gmap = new Map();
  for (const c of cols) {
    if (c.groupLabel === 'Averages') continue;
    let g = gmap.get(c.groupId);
    if (!g) {
      g = { label: c.groupLabel, members: [] };
      gmap.set(c.groupId, g);
      groups.push(g);
    }
    g.members.push(c);
  }

  const pctOf = (period, id) => {
    const v = period.cells?.[id]?.pct;
    return v != null && Number.isFinite(v) ? v : null;
  };
  // % moves per column -> displayed values. For 'index', chain from 100; a missing move
  // breaks the chain, so that column and every later one stay blank (never carried flat).
  const series = (moves) => {
    if (metric !== 'index') return moves;
    let level = 100;
    return moves.map((m) => (level = level == null || m == null ? null : level * (1 + m / 100)));
  };
  const fmt = (v, bold = false) => {
    if (v == null) return { text: '', bold };
    if (metric === 'index') return { text: v.toFixed(1), bold };
    return { text: `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, tone: directionOf(v), bold };
  };

  const auxRows = [];
  for (const g of groups) {
    const catMoves = periods.map((p) => {
      const vals = g.members.map((m) => pctOf(p, m.canonicalId)).filter((v) => v != null);
      return vals.length ? avg(vals) : null;
    });
    auxRows.push([{ text: g.label, bold: true }, ...series(catMoves).map((v) => fmt(v, true))]);
    for (const m of g.members) {
      const moves = periods.map((p) => pctOf(p, m.canonicalId));
      auxRows.push([{ text: `  ${m.label}` }, ...series(moves).map((v) => fmt(v))]);
    }
  }

  // Trailing columns with no numbers at all mean the source has no capture inside them.
  const blankTail = [];
  for (let i = periods.length - 1; i >= 0; i--) {
    if (!cols.every((c) => pctOf(periods[i], c.canonicalId) == null)) break;
    blankTail.unshift(periodLabels[i]);
  }

  return {
    headers: ['Category / subcategory', ...periodLabels],
    align: ['left', ...periodLabels.map(() => 'right')],
    rows: auxRows,
    baseLabel: baseRow ? tidy(baseRow.label) : null,
    blankTail,
  };
}

/** Subtitle suffix explaining empty trailing columns, using the source's real data date. */
function blankNote(t, dataThrough) {
  const cols = t?.blankTail || [];
  if (!cols.length) return '';
  const names = cols.length === 1 ? cols[0] : `${cols.slice(0, -1).join(', ')} and ${cols[cols.length - 1]}`;
  const since = dataThrough ? ` since ${dayLabel(dataThrough)}` : '';
  return ` ${names} ${cols.length === 1 ? 'is' : 'are'} blank: the source has had no new TI price capture${since}, so there is no move to show yet.`;
}

/** Drop the build-only fields before the table goes into the data file. */
const finish = (t) => {
  const { baseLabel, blankTail, ...table } = t;
  return table;
};

export async function connect(system) {
  const base = system.source.base;
  const params = system.source.params ? `&${system.source.params}` : '';
  // The trend API's `liveAsOf` is just today's snapshot date; it moves even when no new TI
  // prices land. The like-for-like status endpoint gives the date of the last real capture.
  const lflStatusUrl = `${new URL(base).origin}/api/ti/universe/catalog/lfl/status`;
  const [qoq, mom, lflStatus] = await Promise.all([
    getJson(`${base}?view=qoq${params}`),
    getJson(`${base}?view=mom${params}`).catch(() => null),
    getJson(lflStatusUrl, { retries: 1 }).catch(() => null),
  ]);
  if (!qoq?.rows?.length) throw new Error('TI trend series returned no rows');
  const lastCapture = /^\d{4}-\d{2}-\d{2}$/.test(String(lflStatus?.total?.last_date ?? ''))
    ? lflStatus.total.last_date
    : null;
  // Never report data newer than the trend snapshot itself.
  const dataThrough = lastCapture && (!qoq.liveAsOf || lastCapture < qoq.liveAsOf) ? lastCapture : qoq.liveAsOf || null;

  // headline = overall average QoQ move at the latest CLOSED quarter (the live QTD row has no
  // % yet), from the source's own "Average" column (falls back to the mean of all categories).
  const avgCol = (qoq.columns || []).find((c) => c.groupLabel === 'Averages' || c.label === 'Average');
  const periods = qoq.rows;
  const closed = periods.filter((p) => !p.liveToDate && !p.bridgeRow);
  const headRow = closed[closed.length - 1] || periods[periods.length - 1];
  const prevRow = closed[closed.length - 2];
  const headPct = avgCol
    ? headRow.cells?.[avgCol.canonicalId]?.pct ?? null
    : avg((qoq.columns || []).map((c) => headRow.cells?.[c.canonicalId]?.pct).filter((v) => v != null));
  const headFrac = headPct != null && Number.isFinite(headPct) ? headPct / 100 : null;

  // metric-toggle groups: UBS Compare (% move, default) and Price (index level), each with
  // a QoQ matrix and a MoM matrix (last 4 periods).
  const ubsTables = [];
  const priceTables = [];
  const qUbs = buildMatrix(qoq, 'pct');
  const qPrice = buildMatrix(qoq, 'index');
  if (qUbs) {
    qUbs.title = 'UBS Compare — quarter-on-quarter price move';
    qUbs.subtitle = `Each cell is that quarter’s % price move, by category and subcategory.${blankNote(qUbs, dataThrough)}`;
    ubsTables.push(finish(qUbs));
  }
  if (qPrice) {
    qPrice.title = 'Price — quarterly index level (base 100)';
    qPrice.subtitle = `Like-for-like price index, rebased to 100 at ${qPrice.baseLabel ? `the end of ${qPrice.baseLabel}` : 'the first period’s start'} and chained from each quarter’s % move.${blankNote(qPrice, dataThrough)}`;
    priceTables.push(finish(qPrice));
  }
  if (mom?.rows?.length) {
    const mUbs = buildMatrix(mom, 'pct');
    const mPrice = buildMatrix(mom, 'index');
    if (mUbs) {
      mUbs.title = 'UBS Compare — month-on-month price move';
      mUbs.subtitle = `Each cell is that month’s % price move, by category and subcategory.${blankNote(mUbs, dataThrough)}`;
      ubsTables.push(finish(mUbs));
    }
    if (mPrice) {
      mPrice.title = 'Price — monthly index level (base 100)';
      mPrice.subtitle = `Like-for-like price index, rebased to 100 at ${mPrice.baseLabel ? `the end of ${mPrice.baseLabel}` : 'the first period’s start'} and chained from each month’s % move. A blank month breaks the chain, so later months stay blank too.${blankNote(mPrice, dataThrough)}`;
      priceTables.push(finish(mPrice));
    }
  }
  const auxTableGroups = [
    { label: 'UBS Compare', tables: ubsTables },
    { label: 'Price', tables: priceTables },
  ].filter((g) => g.tables.length);

  const headTxt =
    headFrac == null
      ? '—'
      : Math.abs(headFrac) < 0.0005
        ? 'flat'
        : headFrac >= 0
          ? `up ${(headFrac * 100).toFixed(2)}%`
          : `down ${Math.abs(headFrac * 100).toFixed(2)}%`;
  const summary = `TI catalog pricing was ${headTxt} quarter-on-quarter on the stock-weighted index (${
    prevRow ? `${tidy(prevRow.label)} → ` : ''
  }${tidy(headRow.label)}). UBS Compare shows each category’s move per period; switch to Price for the index levels.`;

  // single QoQ view carries the headline; the matrices (above) are the detail, so the
  // standard per-segment breakdown is intentionally empty.
  const qoqView = {
    comparison: 'QoQ',
    label: 'Quarter',
    available: headFrac != null,
    thisPeriodLabel: tidy(headRow.label),
    lastPeriodLabel: prevRow ? tidy(prevRow.label) : '—',
    thisValue: null,
    lastValue: null,
    changePct: headFrac,
    changeAbs: null,
    direction: directionOf(headFrac),
    breakdown: [],
    summary,
  };

  const asOf = dataThrough ? `${dataThrough}T00:00:00Z` : new Date().toISOString();
  const block = makeBlock(system, {
    unit: 'price index',
    metricLabel: 'TI catalog pricing',
    comparison: 'QoQ',
    thisPeriodLabel: qoqView.thisPeriodLabel,
    lastPeriodLabel: qoqView.lastPeriodLabel,
    thisValue: null,
    lastValue: null,
    changePct: headFrac,
    direction: directionOf(headFrac),
    asOf,
    breakdown: [],
    summary,
    notes:
      'TI catalog pricing from the source dashboard’s live like-for-like engine (stock-weighted ASP, constant-basket). "UBS Compare" shows each category / subcategory’s % move per period; "Price" chains those moves into an index rebased to 100. Last 4 periods shown; refreshed daily via the TI catalog / Mouser.',
  });
  block.views = [qoqView];
  block.changeNoun = 'Price change';
  block.auxTableGroups = auxTableGroups;
  return block;
}
