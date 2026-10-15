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
