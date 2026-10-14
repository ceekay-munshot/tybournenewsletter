// Pure helpers for the SVG chart kit — axis ticks, scales, line/area paths.

/** "Nice" rounded ticks from 0..max for clean, few gridlines. */
export function niceTicks(max: number, count = 4): { ticks: number[]; niceMax: number } {
  if (!Number.isFinite(max) || max <= 0) return { ticks: [0, 1], niceMax: 1 };
  const rawStep = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step: number;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5;
  else if (norm <= 5) step = 5;
  else step = 10;
  step *= mag;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= niceMax + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { ticks, niceMax };
}

export function linScale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Polyline path from points. */
export function linePath(points: [number, number][]): string {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
}

export function areaPath(points: [number, number][], baseY: number): string {
  if (!points.length) return '';
  const top = linePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${top} L ${last[0].toFixed(2)} ${baseY.toFixed(2)} L ${first[0].toFixed(2)} ${baseY.toFixed(2)} Z`;
}

/** Approximate length for the stroke-dash entrance animation. */
export function polylineLength(points: [number, number][]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    len += Math.hypot(dx, dy);
  }
  return Math.ceil(len) + 10;
}
