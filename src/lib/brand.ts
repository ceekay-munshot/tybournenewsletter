// Munshot consolidated-dashboard brand kit — colours + small colour helpers.
// Neutrals use Tailwind's built-in `slate` scale (slate-900/700/500/400/200),
// which matches our ink/body/muted/hint/line tokens exactly. Accents live here.

import type { Direction, SectorId } from '../types';

export const SECTOR_COLOR: Record<SectorId, string> = {
  technology: '#6366F1', // indigo
  industrial: '#F59E0B', // amber
  financial: '#10B981', // emerald
  macro: '#EC4899', // pink
};

export const DIRECTION_COLOR: Record<Direction, string> = {
  up: '#10B981', // green = up
  down: '#F43F5E', // red = down
  flat: '#94A3B8', // slate = flat
};

// Categorical series palette for breakdowns (>=8 distinct, cycles if longer).
export const SERIES = [
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#06B6D4',
  '#8B5CF6',
  '#EF4444',
  '#14B8A6',
  '#F97316',
  '#3B82F6',
] as const;

export const seriesColor = (i: number): string => SERIES[((i % SERIES.length) + SERIES.length) % SERIES.length];
export const sectorColor = (id: SectorId | string): string =>
  SECTOR_COLOR[id as SectorId] ?? '#6366F1';
export const directionColor = (d: Direction): string => DIRECTION_COLOR[d] ?? DIRECTION_COLOR.flat;

/** hex -> rgba string with alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Lighten (amt>0) or darken (amt<0) a hex colour, amt in -1..1. */
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)));
  const to2 = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}
