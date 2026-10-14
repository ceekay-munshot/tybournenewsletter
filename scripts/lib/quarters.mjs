// Calendar period helpers. All dates treated as UTC so quarter edges are stable.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO date/instant -> "2026-Q3" */
export function quarterOf(dateISO) {
  const d = new Date(dateISO);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

/** ISO date/instant -> "2026-09" */
export function monthOf(dateISO) {
  const d = new Date(dateISO);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2026-Q3" -> "Q3 '26" */
export function quarterLabel(qid) {
  const m = /^(\d{4})-Q([1-4])$/.exec(qid || '');
  if (!m) return qid || '';
  return `Q${m[2]} '${m[1].slice(2)}`;
}

/** "2026-09" (or "2026-09-15") -> "Sep '26" */
export function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})/.exec(ym || '');
  if (!m) return ym || '';
  const idx = parseInt(m[2], 10) - 1;
  return `${MONTHS[idx] ?? m[2]} '${m[1].slice(2)}`;
}

/** "2026-Q3" -> "2026-Q2" (wraps year) */
export function prevQuarter(qid) {
  const m = /^(\d{4})-Q([1-4])$/.exec(qid || '');
  if (!m) return qid || '';
  let y = parseInt(m[1], 10);
  let q = parseInt(m[2], 10) - 1;
  if (q < 1) {
    q = 4;
    y -= 1;
  }
  return `${y}-Q${q}`;
}

/** "2026-Q3" -> ["2026-07","2026-08","2026-09"] */
export function quarterMonths(qid) {
  const m = /^(\d{4})-Q([1-4])$/.exec(qid || '');
  if (!m) return [];
  const start = (parseInt(m[2], 10) - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${m[1]}-${String(start + i).padStart(2, '0')}`);
}

/** "2026-09" -> "2026-Q3" */
export function monthToQuarter(ym) {
  const m = /^(\d{4})-(\d{2})/.exec(ym || '');
  if (!m) return null;
  const q = Math.floor((parseInt(m[2], 10) - 1) / 3) + 1;
  return `${m[1]}-Q${q}`;
}

/** The calendar quarter we are currently in, e.g. "2026-Q4". */
export function currentQuarterId(now = new Date()) {
  return quarterOf(now.toISOString());
}
