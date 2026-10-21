// Texas Instruments Prices — from the source dashboard's "UBS Compare" trend engine
// (?weighted=1&lfl=1 — stock-weighted ASP with a constant-basket like-for-like overlay).
// The founder wants the UBS-Compare view by default: each category / subcategory's price
// MOVE per period, with a toggle to see the underlying PRICE INDEX level instead. Both are
// shown as a matrix of category→subcategory rows × the last few periods, for MoM and QoQ.
import { getJson } from '../lib/http.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const N_PERIODS = 4; // last 3-4 periods as columns (founder: enough to read the trend)
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// "QTD · Q4-26" -> "Q4-26 QTD"; "Q3-26" -> "Q3-26"
const tidy = (label) => (String(label).includes('·') ? `${String(label).split('·').pop().trim()} QTD` : String(label));

/** Build a category→subcategory × last-N-periods matrix as an AuxTable.
 *  metric 'pct' = each period's % move (UBS Compare); 'index' = the price index level. */
function buildMatrix(data, metric) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const cols = Array.isArray(data?.columns) ? data.columns : [];
  if (!rows.length || !cols.length) return null;

  const periods = rows.slice(-N_PERIODS);
  const periodLabels = periods.map((p) => tidy(p.label));

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

  const valOf = (period, id) => {
    const cell = period.cells?.[id];
    if (!cell) return null;
    const v = metric === 'index' ? cell.index : cell.pct;
    return v != null && Number.isFinite(v) ? v : null;
  };
  const fmt = (v, bold = false) => {
    if (v == null) return { text: '', bold };
    if (metric === 'index') return { text: v.toFixed(1), bold };
    return { text: `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, tone: directionOf(v), bold };
  };

  const auxRows = [];
  for (const g of groups) {
    const catCells = periods.map((p) => {
      const vals = g.members.map((m) => valOf(p, m.canonicalId)).filter((v) => v != null);
      return fmt(vals.length ? avg(vals) : null, true);
    });
    auxRows.push([{ text: g.label, bold: true }, ...catCells]);
    for (const m of g.members) {
      auxRows.push([{ text: `  ${m.label}` }, ...periods.map((p) => fmt(valOf(p, m.canonicalId)))]);
    }
  }

  return {
    headers: ['Category / subcategory', ...periodLabels],
    align: ['left', ...periodLabels.map(() => 'right')],
    rows: auxRows,
  };
}

export async function connect(system) {
  const base = system.source.base;
  const params = system.source.params ? `&${system.source.params}` : '';
  const [qoq, mom] = await Promise.all([
    getJson(`${base}?view=qoq${params}`),
    getJson(`${base}?view=mom${params}`).catch(() => null),
  ]);
  if (!qoq?.rows?.length) throw new Error('TI trend series returned no rows');

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
    qUbs.subtitle = 'Each cell is that quarter’s % price move, by category and subcategory.';
    ubsTables.push(qUbs);
  }
  if (qPrice) {
    qPrice.title = 'Price — quarterly index level (base 100)';
    qPrice.subtitle = 'Stock-weighted catalog price index at each quarter-end.';
    priceTables.push(qPrice);
  }
  if (mom?.rows?.length) {
    const mUbs = buildMatrix(mom, 'pct');
    const mPrice = buildMatrix(mom, 'index');
    if (mUbs) {
      mUbs.title = 'UBS Compare — month-on-month price move';
      mUbs.subtitle = 'Each cell is that month’s % price move, by category and subcategory.';
      ubsTables.push(mUbs);
    }
    if (mPrice) {
      mPrice.title = 'Price — monthly index level (base 100)';
      mPrice.subtitle = 'Stock-weighted catalog price index at each month-end.';
      priceTables.push(mPrice);
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

  const asOf = qoq.liveAsOf ? `${qoq.liveAsOf}T00:00:00Z` : new Date().toISOString();
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
      'TI catalog pricing from the source dashboard’s live like-for-like engine (stock-weighted ASP, constant-basket). "UBS Compare" shows each category / subcategory’s % move per period; "Price" shows the underlying index level (base 100). Last 4 periods shown; refreshed daily via the TI catalog / Mouser.',
  });
  block.views = [qoqView];
  block.changeNoun = 'Price change';
  block.auxTableGroups = auxTableGroups;
  return block;
}
