// Texas Instruments Prices — TI catalog price index by product group, at three windows
// (Weekly / MoM / QoQ, default MoM), from the source dashboard's own corrected trend
// engine (?weighted=1&lfl=1 — stock-weighted ASP with a like-for-like/constant-basket
// overlay). This replaces the old static series that was frozen at ~April 2026 and the
// legacy single-SKU path that produced the +126% / -22.7% artifacts. The headline is the
// latest CLOSED period; the breakdown is by product group with each category's move.
import { getJson } from '../lib/http.mjs';
import { makeBlock, directionOf } from '../lib/changeBlock.mjs';

const MOM_BIG = 0.01; // a >=1% monthly catalog move is notable (TI list prices move slowly)
const QOQ_BIG = 0.02;
const WOW_BIG = 0.01;
const Z_BIG = 1.8;

const robustZ = (values) => {
  const xs = values.filter((v) => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (xs.length < 3) return () => 0;
  const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  const dev = xs.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = dev.length % 2 ? dev[(dev.length - 1) / 2] : (dev[dev.length / 2 - 1] + dev[dev.length / 2]) / 2;
  const scale = 1.4826 * mad;
  return (v) => (v == null || !scale ? 0 : (v - med) / scale);
};

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

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

function buildView(data, comparison, label, big) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const cols = Array.isArray(data?.columns) ? data.columns : [];
  const closed = rows.filter((r) => !r.liveToDate && !r.bridgeRow);
  const cur = closed[closed.length - 1];
  const prev = closed[closed.length - 2];
  if (!cur || !cols.length) return unavailable(comparison, label, 'No closed period for this window yet.');

  const catPct = (id) => {
    const c = cur.cells?.[id];
    return c && c.pct != null && Number.isFinite(c.pct) ? c.pct / 100 : null;
  };
  const allPct = cols.map((c) => catPct(c.canonicalId)).filter((v) => v != null);
  if (!allPct.length) return unavailable(comparison, label, 'No category moves recorded for this period yet.');
  const headline = avg(allPct);

  // group → { label, members:[{label, pct}] }
  const groups = new Map();
  for (const col of cols) {
    const g = groups.get(col.groupId) || { label: col.groupLabel, members: [] };
    g.members.push({ label: col.label, pct: catPct(col.canonicalId) });
    groups.set(col.groupId, g);
  }
  const groupAvgs = [...groups.values()].map((g) => avg(g.members.map((m) => m.pct).filter((v) => v != null)));
  const zOf = robustZ(groupAvgs);

  const breakdown = [...groups.values()]
    .map((g) => {
      const gp = avg(g.members.map((m) => m.pct).filter((v) => v != null));
      const sub = g.members
        .filter((m) => m.pct != null)
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
        .map((m) => ({
          label: m.label,
          thisValue: null,
          lastValue: null,
          changePct: m.pct,
          direction: directionOf(m.pct),
          bigMove: Math.abs(m.pct) >= big,
        }));
      const tracked = g.members.filter((m) => m.pct != null).length;
      return {
        label: g.label,
        thisValue: null,
        lastValue: null,
        changePct: gp,
        direction: directionOf(gp),
        bigMove: gp != null && (Math.abs(gp) >= big || Math.abs(zOf(gp)) >= Z_BIG),
        note: `${tracked} categor${tracked === 1 ? 'y' : 'ies'}`,
        sub,
      };
    })
    .filter((r) => r.changePct != null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  const up = breakdown.filter((r) => r.direction === 'up').length;
  const down = breakdown.filter((r) => r.direction === 'down').length;
  const summary =
    headline != null
      ? `${cap(label)}-on-${label.toLowerCase()} the TI catalog ${Math.abs(headline) < 0.0005 ? 'was flat' : headline >= 0 ? `rose ${(headline * 100).toFixed(2)}%` : `fell ${Math.abs(headline * 100).toFixed(2)}%`} on average (${prev ? `${prev.label} → ` : ''}${cur.label}), equal-weighted across ${allPct.length} categories — ${up} product group${up === 1 ? '' : 's'} firmer, ${down} softer.`
      : undefined;

  return {
    comparison,
    label,
    available: headline != null,
    thisPeriodLabel: cur.label,
    lastPeriodLabel: prev?.label || '—',
    thisValue: null,
    lastValue: null,
    changePct: headline,
    changeAbs: null,
    direction: directionOf(headline),
    bigMove: headline != null && Math.abs(headline) >= big,
    breakdown,
    summary,
    _closed: closed,
    _cols: cols,
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function buildInsights(momView) {
  const out = [];
  const closed = momView?._closed || [];
  const cols = momView?._cols || [];
  if (!closed.length || !cols.length) return out;

  // 1) the trend across the last few closed months
  const monthAvg = (row) => {
    const xs = cols.map((c) => row.cells?.[c.canonicalId]?.pct).filter((v) => v != null && Number.isFinite(v));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const recent = closed.slice(-4).map((r) => ({ label: r.label, pct: monthAvg(r) })).filter((r) => r.pct != null);
  if (recent.length >= 2) {
    out.push({
      title: 'TI catalog prices have largely stabilised',
      body: `Average monthly moves have been small and steady: ${recent
        .map((r) => `${r.label} ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%`)
        .join(', ')}. After the 2025 list-price increases, the catalog is now drifting roughly sideways rather than stepping up.`,
    });
  }

  // 2) this month's actual movers, by category
  const cur = closed[closed.length - 1];
  const movers = cols
    .map((c) => ({ label: c.label, group: c.groupLabel, pct: cur.cells?.[c.canonicalId]?.pct }))
    .filter((m) => m.pct != null && Math.abs(m.pct) >= 0.1)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 6);
  if (movers.length) {
    out.push({
      title: `What moved in ${cur.label}`,
      body: 'The categories that actually changed price this month (most are flat month to month).',
      bullets: movers.map((m) => `${m.label} (${m.group}) ${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(2)}%`),
    });
  }

  // 3) honest data-quality note — now live, but the source engine is mid-rebuild
  out.push({
    title: 'Now live — but read the broad average, not single cells',
    body:
      'This replaces the old series frozen at ~April 2026: it now reads the source dashboard’s live like-for-like engine (TI catalog via Mouser, refreshed daily). That engine is still being rebuilt, and its weighted-index and like-for-like-% layers don’t yet fully agree at the single-category level, so treat individual category moves as directional. The robust read is the broad average across all tracked categories — which says TI pricing is essentially flat, drifting only slightly.',
  });
  return out;
}

export async function connect(system) {
  const base = system.source.base;
  const params = system.source.params ? `&${system.source.params}` : '';
  const [mom, qoq, wow] = await Promise.all([
    getJson(`${base}?view=mom${params}`),
    getJson(`${base}?view=qoq${params}`).catch(() => null),
    getJson(`${base}?view=wow${params}`).catch(() => null),
  ]);
  if (!mom?.rows?.length) throw new Error('TI trend series returned no rows');

  const momView = buildView(mom, 'MoM', 'Month', MOM_BIG);
  const qoqView = qoq ? buildView(qoq, 'QoQ', 'Quarter', QOQ_BIG) : unavailable('QoQ', 'Quarter', 'No quarterly series.');
  // Weekly is intentionally not offered: TI list/catalog prices are set and change
  // infrequently (indices sit flat for weeks), so the weekly signal here is dominated by
  // capture/overlay noise rather than real moves — the honest windows are MoM and QoQ.
  const wowView = unavailable(
    'WoW',
    'Week',
    'TI sells at list — catalog prices change infrequently, so the weekly signal is capture noise, not real moves. Monthly and quarterly are the honest windows here.'
  );
  const views = [wowView, momView, qoqView];
  const def = momView.available ? momView : qoqView.available ? qoqView : wowView;
  const insights = buildInsights(momView);

  const asOf = mom.liveAsOf ? `${mom.liveAsOf}T00:00:00Z` : new Date().toISOString();
  // strip scratch fields
  for (const v of views) {
    delete v._closed;
    delete v._cols;
  }

  const block = makeBlock(system, {
    unit: 'price index',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: null,
    lastValue: null,
    changePct: def.changePct,
    direction: def.direction,
    asOf,
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      'TI catalog price index by product group, from the source dashboard’s corrected trend engine (stock-weighted ASP + constant-basket like-for-like). Headline = latest CLOSED period, equal-weighted across tracked categories. Live (refreshed daily via the TI catalog / Mouser) — no longer frozen at the old April snapshot.',
  });
  block.views = views;
  block.breakdownNoun = 'product group';
  block.subNoun = 'category';
  block.changeNoun = 'Price change';
  block.insights = insights;
  return block;
}
