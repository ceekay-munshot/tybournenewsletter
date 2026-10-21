// Builders + shared math for the ChangeBlock data contract.
// changePct is always a FRACTION (0.157 == +15.7%). The UI multiplies by 100.

/** Up if >eps, down if <-eps, else flat. eps = 0.05% kills numeric noise. */
export function directionOf(changePct, eps = 0.0005) {
  if (changePct == null || !Number.isFinite(changePct)) return 'flat';
  if (changePct > eps) return 'up';
  if (changePct < -eps) return 'down';
  return 'flat';
}

/** Fractional change (this-last)/last, null-safe. */
export function pctChange(thisV, lastV) {
  if (thisV == null || lastV == null || !Number.isFinite(thisV) || !Number.isFinite(lastV) || lastV === 0) {
    return null;
  }
  return (thisV - lastV) / lastV;
}

/** Latest underlying data older than ~1.5 periods -> stale. */
export function isStale(asOf, comparison) {
  if (!asOf) return false;
  const then = new Date(asOf).getTime();
  if (!Number.isFinite(then)) return false;
  const days = (Date.now() - then) / 86400000;
  const periodDays = comparison === 'MoM' ? 30 : comparison === 'WoW' ? 7 : 91;
  return days > periodDays * 1.5;
}

/** Attach the PRIOR comparison onto a latest breakdown so the UI can show two consecutive
 *  periods of trend. `latestRows` and `priorRows` are the SAME breakdown computed for the
 *  latest period-pair and the one before it; matched by label, recursively through subs.
 *  Each latest row gains: prevValue (the prior pair's lastValue), prevChangePct/prevChangeAbs
 *  (the prior pair's move) and prevDirection. Rows with no prior match are left untouched. */
export function attachPrev(latestRows, priorRows) {
  const pm = new Map((priorRows || []).map((r) => [r.label, r]));
  for (const r of latestRows || []) {
    const p = pm.get(r.label);
    if (p) {
      r.prevValue = p.lastValue ?? null;
      r.prevChangePct = p.changePct ?? null;
      r.prevChangeAbs = p.changeAbs ?? null;
      r.prevDirection = p.direction ?? directionOf(p.changePct ?? null);
    }
    if (r.sub && p?.sub) attachPrev(r.sub, p.sub);
  }
  return latestRows;
}

/** True when prevValue → lastValue genuinely chains with the prior change. For like-for-like
 *  basket metrics (CPU/Schneider) the three values come from shifting baskets, so the chain
 *  can't close — we then keep the honest prior CHANGE but drop the misleading prior VALUE. */
function chainsPrev(prevValue, lastValue, pct, abs, display) {
  if (prevValue == null || lastValue == null || !Number.isFinite(prevValue) || !Number.isFinite(lastValue)) return false;
  if (display === 'pp' || display === 'pts') {
    if (abs == null) return false;
    return Math.abs(lastValue - (prevValue + abs)) <= 0.05 + Math.abs(lastValue) * 0.005;
  }
  if (pct == null || prevValue === 0) return false;
  return Math.abs(lastValue - prevValue * (1 + pct)) <= Math.abs(lastValue) * 0.015 + 1e-9;
}

/** Drop a prior VALUE that doesn't chain cleanly with its prior change (keeps the change).
 *  Applied to the headline + every breakdown row/sub of a view. */
export function reconcilePrev(view) {
  const fix = (o, display) => {
    if (o.prevValue != null && !chainsPrev(o.prevValue, o.lastValue, o.prevChangePct, o.prevChangeAbs, display)) {
      o.prevValue = null;
    }
  };
  fix(view, view.changeDisplay);
  for (const r of view.breakdown || []) {
    fix(r, r.changeDisplay ?? view.changeDisplay);
    for (const s of r.sub || []) fix(s, s.changeDisplay ?? view.changeDisplay);
  }
  return view;
}

/** One breakdown row. Pass an explicit changePct to override the derived one (e.g. API-reported). */
export function mkBreakdown(label, thisValue, lastValue, changePctOverride) {
  const changePct =
    changePctOverride !== undefined ? changePctOverride : pctChange(thisValue, lastValue);
  return {
    label,
    thisValue: thisValue ?? null,
    lastValue: lastValue ?? null,
    changePct,
    direction: directionOf(changePct),
  };
}

/** Assemble a complete, well-typed ChangeBlock from a system config + computed fields. */
export function makeBlock(system, f) {
  const changePct = f.changePct ?? null;
  const thisValue = f.thisValue ?? null;
  const lastValue = f.lastValue ?? null;
  return {
    systemId: system.id,
    name: system.name,
    sector: system.sector,
    metricLabel: f.metricLabel ?? system.metricLabel ?? '',
    unit: f.unit ?? '',
    comparison: f.comparison ?? 'QoQ',
    thisPeriodLabel: f.thisPeriodLabel ?? '—',
    lastPeriodLabel: f.lastPeriodLabel ?? '—',
    thisValue,
    lastValue,
    changePct,
    changeAbs:
      f.changeAbs ?? (thisValue != null && lastValue != null ? thisValue - lastValue : null),
    direction: f.direction ?? directionOf(changePct),
    ...(f.changeDisplay ? { changeDisplay: f.changeDisplay } : {}),
    asOf: f.asOf ?? new Date().toISOString(),
    isStale: f.isStale ?? isStale(f.asOf, f.comparison ?? 'QoQ'),
    breakdown: f.breakdown ?? [],
    ...(f.trend && f.trend.length ? { trend: f.trend } : {}),
    ...(f.highlights && f.highlights.length ? { highlights: f.highlights } : {}),
    ...(f.tone ? { tone: f.tone } : {}),
    ...(f.thisTone ? { thisTone: f.thisTone } : {}),
    ...(f.prevHighlights && f.prevHighlights.length ? { prevHighlights: f.prevHighlights } : {}),
    ...(f.prevTone ? { prevTone: f.prevTone } : {}),
    ...(f.newHighlights && f.newHighlights.length ? { newHighlights: f.newHighlights } : {}),
    ...(f.summary ? { summary: f.summary } : {}),
    ...(f.secondaryMetrics && f.secondaryMetrics.length ? { secondaryMetrics: f.secondaryMetrics } : {}),
    sourceName: system.sourceName ?? f.sourceName ?? '',
    sourceUrl: f.sourceUrl ?? system.dashboardUrl ?? '',
    dashboardUrl: system.dashboardUrl ?? null,
    ...(f.notes ? { notes: f.notes } : {}),
    status: f.status ?? 'ok',
    ...(f.statusReason ? { statusReason: f.statusReason } : {}),
  };
}

/** Honest empty block for a connector that failed. Never fabricates numbers. */
export function errorBlock(system, reason) {
  return {
    systemId: system.id,
    name: system.name,
    sector: system.sector,
    metricLabel: system.metricLabel ?? '',
    unit: '',
    comparison: 'QoQ',
    thisPeriodLabel: '—',
    lastPeriodLabel: '—',
    thisValue: null,
    lastValue: null,
    changePct: null,
    changeAbs: null,
    direction: 'flat',
    asOf: new Date().toISOString(),
    isStale: false,
    breakdown: [],
    sourceName: system.sourceName ?? '',
    sourceUrl: system.dashboardUrl ?? '',
    dashboardUrl: system.dashboardUrl ?? null,
    status: 'error',
    statusReason: reason,
  };
}

/** Assemble a last-N-periods series onto `latest` and each of its breakdown rows (+sub)
 *  from an array of period-views (NEWEST FIRST). Each view is a full view object with a
 *  .breakdown (rows, each with optional .sub), .thisPeriodLabel, .thisValue, .changePct,
 *  .changeAbs, .direction. Rows are matched across periods by label; needs >=2 views. */
export function attachSeries(latest, viewsNewestFirst) {
  const vs = (viewsNewestFirst || []).filter((v) => v && v.available);
  if (vs.length < 2) return;
  const ordered = vs.slice().reverse(); // oldest -> newest
  const pt = (v, src) => ({
    label: v.thisPeriodLabel,
    value: src ? src.thisValue ?? null : null,
    changePct: src ? src.changePct ?? null : null,
    changeAbs: src ? src.changeAbs ?? null : null,
    direction: src ? src.direction ?? directionOf(src.changePct ?? src.changeAbs ?? null) : 'flat',
  });
  latest.series = ordered.map((v) => ({
    label: v.thisPeriodLabel,
    value: v.thisValue ?? null,
    changePct: v.changePct ?? null,
    changeAbs: v.changeAbs ?? null,
    direction: v.direction ?? 'flat',
  }));
  for (const r of latest.breakdown || []) {
    r.series = ordered.map((v) => pt(v, (v.breakdown || []).find((x) => x.label === r.label)));
    for (const s of r.sub || []) {
      s.series = ordered.map((v) =>
        pt(v, (v.breakdown || []).find((x) => x.label === r.label)?.sub?.find((y) => y.label === s.label))
      );
    }
  }
}

/** Build a SeriesPoint[] (oldest→newest) from an array of { label, value } points — the
 *  change INTO each point is derived from the chaining values. `display` picks the metric:
 *  'pct' → changePct = (v-prev)/prev (a fraction); 'pp'|'pts' → changeAbs = v - prev.
 *  The first point carries no change. Pass the last N periods in chronological order. */
export function buildSeries(points, display = 'pct') {
  const pts = Array.isArray(points) ? points : [];
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const v = pts[i]?.value ?? null;
    const prev = i > 0 ? pts[i - 1]?.value ?? null : null;
    let changePct = null;
    let changeAbs = null;
    if (i > 0 && v != null && prev != null && Number.isFinite(v) && Number.isFinite(prev)) {
      if (display === 'pp' || display === 'pts') changeAbs = v - prev;
      else if (prev !== 0) changePct = (v - prev) / prev;
    }
    const dir = display === 'pp' || display === 'pts' ? directionOf(changeAbs) : directionOf(changePct);
    out.push({ label: pts[i]?.label ?? '', value: v, changePct, changeAbs, direction: dir });
  }
  return out;
}
