// Email the rendered monthly newsletter PDF to the recipient list.
//
// Transport is the Munshot raw-email service (the same one the podcast dashboard
// uses) — a single bearer-token HTTP endpoint, so there is no SMTP, no third-party
// account, and no sender-domain verification to set up (the service sets the From
// address from the token's account). Shells out to curl for one proxy-safe code path.
//
// Reliability:
//   - Missing MUNSHOT_EMAIL_TOKEN / NEWSLETTER_RECIPIENTS is an ERROR (exit 1), not a
//     silent skip — a newsletter that quietly never goes out is the failure we guard against.
//   - The endpoint takes ONE recipient per request, so the list is fanned out; each
//     recipient is retried on a transient failure (network, HTTP 429/5xx) with backoff.
//   - On full success the send is appended to clients/<client>/data/email-log.json, which
//     the workflow commits; later runs that month then skip (scripts/edition-check.mjs).
//     A partial failure exits non-zero WITHOUT recording, so the month is retried.
//   - The PDF is attached when it fits the service's size budget; a link to the live
//     dashboard is always included, so the edition is reachable either way.
//
// Env:
//   MUNSHOT_EMAIL_TOKEN     bearer key for the Munshot mail service (required; EMAIL_TOKEN also accepted)
//   NEWSLETTER_RECIPIENTS   comma-separated recipient addresses (required)
//   EMAIL_API_URL           default https://devde.muns.io/email/send/raw
//   NEWSLETTER_PDF          path to the PDF (default ./tybourne-intelligence.pdf)
//   SITE_URL                live dashboard URL, linked in the email body (optional)
//   CLIENT                  client folder (default tybourne)
//   RUN_URL                 link to the CI run, stored in the send log
//   NEWSLETTER_DRY_RUN      "1" to print what would be sent without calling the service
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowUtc, monthKey, emailLogFile } from './lib/edition.mjs';
import { renderNewsletterEmailHtml } from './lib/newsletter-email-html.mjs';
import { resolveRecipients } from './lib/recipients.mjs';

const pExecFile = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIENT = process.env.CLIENT || 'tybourne';

const TOKEN = process.env.MUNSHOT_EMAIL_TOKEN || process.env.EMAIL_TOKEN || '';
// A test-to-self run (recipient_override) sets NEWSLETTER_RECIPIENTS_ONLY so the send
// goes to exactly that address, never fanning out to the dashboard-managed list.
const EXACT = /^(1|true|yes)$/i.test(process.env.NEWSLETTER_RECIPIENTS_ONLY || '');
const API_URL = process.env.EMAIL_API_URL || 'https://devde.muns.io/email/send/raw';
const PDF = process.env.NEWSLETTER_PDF || resolve(ROOT, 'tybourne-intelligence.pdf');
const SITE_URL = (process.env.SITE_URL || '').trim();
// The email CTA points recipients to Munshot, not the raw deploy URL.
const MUNSHOT_URL = (process.env.MUNSHOT_URL || 'https://www.muns.io').trim();
const MONTH = monthKey(nowUtc());
const LOG_PATH = resolve(ROOT, emailLogFile(CLIENT));
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.NEWSLETTER_DRY_RUN || '');

// The Munshot mail service's attachment budget (base64), matching the podcast's own
// cap for this same endpoint. A PDF over this is still sent — just as a dashboard
// link, never dropped silently. (A ~5.9MB PDF ≈ 7.9MB base64, so it fits.)
const MAX_ATTACH_B64 = 8_000_000;

const ATTEMPTS = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One POST to the Munshot raw-email endpoint for a single recipient, via curl.
 *  Returns { code, body }; code 0 = network-level failure. */
async function post(payloadJson) {
  const args = [
    '-sS', '--location', '--max-time', '120', '-X', 'POST',
    '-H', `Authorization: Bearer ${TOKEN}`,
    '-H', 'Content-Type: application/json',
    '--data-binary', '@-',
    '-w', '\n%{http_code}',
    API_URL,
  ];
  try {
    const child = pExecFile('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    child.child.stdin.end(payloadJson); // body via stdin: a large PDF can exceed the argv limit
    const { stdout } = await child;
    const nl = stdout.lastIndexOf('\n');
    return { code: parseInt(stdout.slice(nl + 1).trim(), 10) || 0, body: stdout.slice(0, nl) };
  } catch (e) {
    return { code: 0, body: (e && (e.stderr || e.message)) || String(e) };
  }
}

/** The endpoint's envelope is { success, message, data:{ message, messageId } }. */
function accepted(code, body) {
  if (code < 200 || code >= 300) return false;
  try {
    return JSON.parse(body)?.success === true;
  } catch {
    return false;
  }
}

/** Send one recipient, with retries on transient failures. Returns { ok, detail }. */
async function sendTo(email, { subject, html, attachments }) {
  const payloadJson = JSON.stringify({ email, subject, html, ...(attachments ? { attachments } : {}) });
  if (DRY_RUN) {
    console.log(`DRY_RUN: would send "${subject}" to ${email} (${attachments ? 'with' : 'no'} attachment, ${payloadJson.length} bytes).`);
    return { ok: true, detail: 'dry-run' };
  }
  let last = { code: 0, body: '' };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = await post(payloadJson);
    if (accepted(last.code, last.body)) return { ok: true, detail: `HTTP ${last.code}` };
    const transient = last.code === 0 || last.code === 429 || last.code >= 500;
    if (!transient || attempt === ATTEMPTS) break;
    const wait = 5000 * 3 ** (attempt - 1); // 5s, 15s, 45s, 135s
    console.log(`Email: ${email} attempt ${attempt} failed (${last.code || 'network'}: ${String(last.body).slice(0, 160)}); retrying in ${wait / 1000}s…`);
    await sleep(wait);
  }
  return { ok: false, detail: last.code ? `HTTP ${last.code}: ${String(last.body).slice(0, 200)}` : `network error: ${String(last.body).slice(0, 200)}` };
}

async function recordSend({ editionLabel, editionGeneratedAt, recipientCount, note }) {
  let log = { sends: [] };
  try {
    log = JSON.parse(await readFile(LOG_PATH, 'utf8'));
    if (!Array.isArray(log.sends)) log.sends = [];
  } catch {
    /* first send */
  }
  log.note = 'Written by scripts/send-newsletter-email.mjs — one entry per month sent. Counts only, no addresses.';
  log.sends.push({
    month: MONTH,
    sentAt: new Date().toISOString(),
    editionLabel,
    editionGeneratedAt,
    recipients: recipientCount,
    transport: 'munshot',
    ...(note ? { note } : {}),
    ...(process.env.RUN_URL ? { runUrl: process.env.RUN_URL } : {}),
  });
  log.sends = log.sends.slice(-36);
  await writeFile(LOG_PATH, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
  console.log(`Email: recorded ${MONTH} send in ${emailLogFile(CLIENT)}.`);
}

async function run() {
  const RECIPIENTS = await resolveRecipients(ROOT, CLIENT, process.env.NEWSLETTER_RECIPIENTS, { exact: EXACT });
  if (!TOKEN || !RECIPIENTS.length) {
    throw new Error(
      'MUNSHOT_EMAIL_TOKEN or a recipient (NEWSLETTER_RECIPIENTS variable or the dashboard recipients list) ' +
        'is not set — the newsletter cannot be sent. Add them under Settings → Secrets and variables → Actions, ' +
        'or add a recipient in the dashboard admin panel.',
    );
  }
  if (!existsSync(PDF)) {
    throw new Error(`PDF not found at ${PDF} — run scripts/render-newsletter-pdf.mjs first.`);
  }

  // Edition label + client name for the subject/body, and the full data for the
  // in-email report (real figures only).
  let editionLabel = 'monthly edition';
  let editionGeneratedAt = null;
  let clientName = 'Tybourne Global Holdings';
  let status = 'unknown';
  let newsletterData = null;
  let consolidatedData = null;
  try {
    newsletterData = JSON.parse(await readFile(resolve(ROOT, `clients/${CLIENT}/data/newsletter.json`), 'utf8'));
    if (newsletterData.editionLabel) editionLabel = newsletterData.editionLabel;
    if (newsletterData.status) status = newsletterData.status;
    editionGeneratedAt = newsletterData.generatedAt ?? null;
  } catch {
    /* newsletter.json optional for the email */
  }
  try {
    consolidatedData = JSON.parse(await readFile(resolve(ROOT, `clients/${CLIENT}/data/consolidated.json`), 'utf8'));
    if (consolidatedData.client?.name) clientName = consolidatedData.client.name;
  } catch {
    /* optional */
  }

  const pdfB64 = (await readFile(PDF)).toString('base64');
  const attachTooBig = pdfB64.length > MAX_ATTACH_B64;
  // The Munshot mail endpoint expects `contentBase64` (not `content`) for attachment bytes.
  const attachments = attachTooBig ? undefined : [{ filename: basename(PDF), contentBase64: pdfB64, contentType: 'application/pdf' }];
  if (attachTooBig) {
    console.log(`::warning::The rendered PDF is ${(pdfB64.length / 1e6).toFixed(1)}MB (base64), over the mail attachment budget — sending with the dashboard link only.`);
  }

  const subject = `${clientName} — Intelligence edition (${editionLabel})`;
  // The full report goes in the email body (same content as the dashboard/PDF): masthead,
  // executive summary, the "everything that moved" table, per-dashboard commentary, watch
  // list and sources. A minimal body is the fallback if the data can't be read.
  let html;
  try {
    if (!consolidatedData) throw new Error('consolidated data unavailable');
    html = renderNewsletterEmailHtml(consolidatedData, newsletterData, { munshotUrl: MUNSHOT_URL, pdfAttached: !!attachments });
  } catch (e) {
    console.log(`::warning::Using the minimal email body (${e instanceof Error ? e.message : e}).`);
    const note = attachments
      ? 'The latest edition is attached as a PDF.'
      : "The PDF was too large to attach this month — reply and we'll send it across.";
    const linkBtn = MUNSHOT_URL
      ? `<p style="margin:0 0 16px"><a href="${MUNSHOT_URL}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Visit Munshot</a></p>`
      : '';
    html =
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#334155;line-height:1.6">` +
      `<h2 style="color:#0f172a;margin:0 0 6px">${clientName} Intelligence</h2>` +
      `<p style="margin:0 0 12px;color:#64748b">${editionLabel}</p>` +
      `<p style="margin:0 0 12px">${note}</p>` +
      linkBtn +
      `<p style="margin:0;color:#94a3b8;font-size:13px">Published by Munshot · 100% real data, every figure source-stamped.</p>` +
      `</div>`;
  }

  console.log(`Email: sending "${subject}" to ${RECIPIENTS.length} recipient(s) via Munshot mail${attachments ? ' with the PDF attached' : ''}.`);

  const message = { subject, html, attachments };
  const failures = [];
  for (const email of RECIPIENTS) {
    const res = await sendTo(email, message);
    if (res.ok) console.log(`Email: sent to ${email} (${res.detail}).`);
    else failures.push(`${email} — ${res.detail}`);
  }

  if (failures.length) {
    throw new Error(`${failures.length} of ${RECIPIENTS.length} recipient(s) failed:\n  ${failures.join('\n  ')}`);
  }
  if (DRY_RUN) {
    console.log('DRY_RUN: all recipients OK (nothing sent, nothing recorded).');
    return;
  }
  await recordSend({ editionLabel, editionGeneratedAt, recipientCount: RECIPIENTS.length });
}

run().catch((e) => {
  console.error('send-newsletter-email failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
