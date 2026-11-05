// The monthly edition calendar, in one place (all times UTC).
//
// Each month's AI edition becomes due on the 2nd at 06:00 UTC (after the SAP research
// refresh on the 1st). From then on, every refresh run that finds no OK edition written
// inside this month's window writes one — so a dropped/late cron or a failed model call
// is retried on the next run instead of waiting a month. The email is sent once per
// month, as soon as this month's edition exists.

export const EDITION_DAY = 2;
export const EDITION_HOUR = 6;
/** How long the email waits for a late edition before it fails loudly. */
export const EDITION_GRACE_HOURS = 48;

export const nowUtc = () => {
  // EDITION_NOW lets the workflows' logic be dry-run for any date (tests / debugging).
  const fake = process.env.EDITION_NOW;
  const d = fake ? new Date(fake) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`EDITION_NOW is not a valid date: ${fake}`);
  return d;
};

/** 'YYYY-MM' of the given instant (UTC). */
export const monthKey = (now = nowUtc()) => now.toISOString().slice(0, 7);

/** This month's edition window start: the 2nd, 06:00 UTC. */
export function editionWindowStart(now = nowUtc()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), EDITION_DAY, EDITION_HOUR));
}

/** After this, a missing edition is an incident (the email fails loudly). */
export function editionDeadline(now = nowUtc()) {
  return new Date(editionWindowStart(now).getTime() + EDITION_GRACE_HOURS * 3600 * 1000);
}

/** True once this month's edition is due to be written. */
export const isEditionDue = (now = nowUtc()) => now >= editionWindowStart(now);

/** True if `nl` (newsletter.json) is an OK AI edition written inside this month's window. */
export function isCurrentEdition(nl, now = nowUtc()) {
  if (!nl || nl.status !== 'ok' || !nl.generatedAt) return false;
  const t = Date.parse(nl.generatedAt);
  return Number.isFinite(t) && t >= editionWindowStart(now).getTime();
}

/**
 * The send log (clients/<client>/data/email-log.json) is the email's memory: one entry
 * per month sent, committed by the email workflow, so every later run that month is a
 * no-op and nobody gets the edition twice. Holds counts only, never addresses.
 */
export const emailLogFile = (client) => `clients/${client}/data/email-log.json`;

/** The log entry for `month` ('YYYY-MM'), or null if that month hasn't been sent. */
export function sentEntry(log, month) {
  return (log?.sends ?? []).find((s) => s.month === month) ?? null;
}

/** One-line description of an edition file for logs. */
export function describeEdition(nl) {
  if (!nl) return 'no newsletter.json';
  const label = nl.editionLabel ? `"${nl.editionLabel}"` : 'no label';
  const note = nl.status !== 'ok' && nl.note ? ` — ${nl.note}` : '';
  return `${label}, status=${nl.status ?? 'unknown'}, generated ${nl.generatedAt ?? 'never'}${note}`;
}
