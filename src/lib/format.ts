// Display formatting. Plain language, tabular-friendly. No domain assumptions
// beyond the handful of units our connectors emit.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A fractional change (0.157) -> "+15.7%". null -> "—". */
export function signedPct(frac: number | null | undefined, dp = 1): string {
  if (frac == null || !Number.isFinite(frac)) return '—';
  const r = (frac * 100).toFixed(dp);
  const num = parseFloat(r);
  if (num > 0) return `+${r}%`;
  if (num === 0) return `${Math.abs(num).toFixed(dp)}%`;
  return `${r}%`;
}

/** A fractional change -> "15.7%" (no sign, for magnitudes). */
export function absPct(frac: number | null | undefined, dp = 1): string {
  if (frac == null || !Number.isFinite(frac)) return '—';
  return `${Math.abs(frac * 100).toFixed(dp)}%`;
}

/** Adaptive signed % for chart axes — more decimals for small magnitudes,
 *  so a ±0.4% domain never collapses to "-0%". */
export function axisPct(frac: number): string {
  if (!Number.isFinite(frac) || frac === 0) return '0';
  const v = frac * 100;
  const dp = Math.abs(v) < 1 ? 2 : Math.abs(v) < 10 ? 1 : 0;
  return `${v > 0 ? '+' : ''}${v.toFixed(dp)}%`;
}

function usd(n: number, dp: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

/** Format a value in its unit. Keeps figures honest and readable. */
export function fmtValue(n: number | null | undefined, unit: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  switch (unit) {
    case '$':
    case '$/1M tokens':
    case '$/GPU-hr':
      return usd(n, Math.abs(n) >= 1000 ? 0 : 2);
    case 'TWD bn':
      return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} bn`;
    case 'tokens':
      return fmtCompact(n);
    case '%':
    case '% share':
    case '% NPL':
    case '% YoY':
      return `${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`;
    case 'score 1-5':
      return n.toFixed(2);
    case 'price index':
    case 'index':
      return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
    case 'rank':
      return `#${Math.round(n)}`;
    case 'positions':
    case 'new Spaces':
    case 'models':
    case 'daily pax':
    case 'episodes':
      return Math.round(n).toLocaleString('en-US');
    default:
      return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}

/** Signed absolute change in its unit, e.g. "-$7.51", "+1,108 bn". */
export function signedValue(n: number | null | undefined, unit: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${fmtValue(Math.abs(n), unit)}`;
}

/** Compact value for dense axes, e.g. 2730 -> "2.7k", 8_186 -> "8.2k". */
export function fmtCompact(n: number | null | undefined, unit = ''): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const body =
    abs >= 1e12
      ? `${(n / 1e12).toFixed(1)}T`
      : abs >= 1e9
        ? `${(n / 1e9).toFixed(1)}B`
        : abs >= 1e6
          ? `${(n / 1e6).toFixed(1)}M`
          : abs >= 1e3
            ? `${(n / 1e3).toFixed(1)}k`
            : abs < 10 && abs > 0
              ? n.toFixed(2)
              : n.toFixed(0);
  if (unit === '$' || unit === '$/1M tokens' || unit === '$/GPU-hr') return `$${body}`;
  return body;
}

/** "2026-10-14T..." -> "14 Oct 2026". */
export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** generatedAt -> "14 Oct 2026, 17:29 UTC". */
export function whenLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}
