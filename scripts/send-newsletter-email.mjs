// Email the rendered monthly newsletter PDF to the recipient list.
//
// Transport is a single bearer-token HTTP API (Resend by default — api.resend.com),
// so there is no SMTP setup and it works from CI through a proxy. Shells out to curl
// for one proxy-safe code path.
//
// Reliability:
//   - Missing EMAIL_TOKEN / NEWSLETTER_RECIPIENTS is an ERROR (exit 1), not a silent
//     skip — a newsletter that quietly never goes out is the failure we guard against.
//   - Transient failures (network, HTTP 429/5xx) are retried with backoff.
//   - Every request carries an Idempotency-Key (one per client+month by default), so a
//     retry — or a re-run after a send that succeeded but wasn't recorded — can't
//     deliver the edition twice.
//   - On success the send is appended to clients/<client>/data/email-log.json, which
//     the workflow commits; later runs that month then skip (scripts/edition-check.mjs).
//
// Env:
//   EMAIL_TOKEN             bearer key for the email API (required)
//   NEWSLETTER_RECIPIENTS   comma-separated recipient addresses (required)
//   EMAIL_FROM              "Name <from@domain>"  (default below)
//   EMAIL_API_URL           default https://api.resend.com/emails
//   EMAIL_IDEMPOTENCY_KEY   override the per-month key (the workflow sets a unique one for forced resends)
//   NEWSLETTER_PDF          path to the PDF (default ./tybourne-intelligence.pdf)
//   CLIENT                  client folder (default tybourne)
//   RUN_URL                 link to the CI run, stored in the send log
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowUtc, monthKey, emailLogFile } from './lib/edition.mjs';

const pExecFile = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIENT = process.env.CLIENT || 'tybourne';

const TOKEN = process.env.EMAIL_TOKEN || '';
const RECIPIENTS = (process.env.NEWSLETTER_RECIPIENTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const FROM = process.env.EMAIL_FROM || 'Munshot Intelligence <newsletter@muns.io>';
const API_URL = process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
const PDF = process.env.NEWSLETTER_PDF || resolve(ROOT, 'tybourne-intelligence.pdf');
const MONTH = monthKey(nowUtc());
const IDEMPOTENCY_KEY = process.env.EMAIL_IDEMPOTENCY_KEY || `${CLIENT}-newsletter-${MONTH}`;
const LOG_PATH = resolve(ROOT, emailLogFile(CLIENT));

const ATTEMPTS = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One POST via curl. Returns { code, body }; code 0 = network-level failure. */
async function post(payloadJson) {
  const args = [
    '-sS', '--location', '--max-time', '120', '-X', 'POST',
    '-H', `Authorization: Bearer ${TOKEN}`,
    '-H', 'Content-Type: application/json',
    '-H', `Idempotency-Key: ${IDEMPOTENCY_KEY}`,
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

async function recordSend({ editionLabel, editionGeneratedAt, apiCode, note }) {
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
    recipients: RECIPIENTS.length,
    api: apiCode,
    ...(note ? { note } : {}),
    ...(process.env.RUN_URL ? { runUrl: process.env.RUN_URL } : {}),
  });
  log.sends = log.sends.slice(-36);
  await writeFile(LOG_PATH, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
  console.log(`Email: recorded ${MONTH} send in ${emailLogFile(CLIENT)}.`);
}

async function run() {
  if (!TOKEN || !RECIPIENTS.length) {
    throw new Error(
      'EMAIL_TOKEN or NEWSLETTER_RECIPIENTS is not set — the newsletter cannot be sent. ' +
        'Add them under GitHub → Settings → Secrets and variables → Actions.',
    );
  }
  if (!existsSync(PDF)) {
    throw new Error(`PDF not found at ${PDF} — run scripts/render-newsletter-pdf.mjs first.`);
  }

  // Pull the edition label + client name for the subject/body (real data only).
  let editionLabel = 'monthly edition';
  let editionGeneratedAt = null;
  let clientName = 'Tybourne Global Holdings';
  let status = 'unknown';
  try {
    const nl = JSON.parse(await readFile(resolve(ROOT, `clients/${CLIENT}/data/newsletter.json`), 'utf8'));
    if (nl.editionLabel) editionLabel = nl.editionLabel;
    if (nl.status) status = nl.status;
    editionGeneratedAt = nl.generatedAt ?? null;
  } catch {
    /* newsletter.json optional for the email */
  }
  try {
    const cd = JSON.parse(await readFile(resolve(ROOT, `clients/${CLIENT}/data/consolidated.json`), 'utf8'));
    if (cd.client?.name) clientName = cd.client.name;
  } catch {
    /* optional */
  }

  const pdfB64 = (await readFile(PDF)).toString('base64');
  const subject = `${clientName} — Intelligence edition (${editionLabel})`;
  const editionNote =
    status === 'ok'
      ? 'The latest edition is attached.'
      : 'The data edition is attached (AI prose off — figures are live and source-stamped, nothing fabricated).';
  const html =
    `<div style="font-family:Inter,system-ui,sans-serif;color:#334155;line-height:1.6">` +
    `<h2 style="font-family:'Space Grotesk',Inter,sans-serif;color:#0f172a;margin:0 0 6px">${clientName} Intelligence</h2>` +
    `<p style="margin:0 0 12px;color:#64748b">${editionLabel}</p>` +
    `<p style="margin:0 0 12px">${editionNote}</p>` +
    `<p style="margin:0;color:#94a3b8;font-size:13px">Published by Munshot · 100% real data, every figure source-stamped.</p>` +
    `</div>`;

  const payloadJson = JSON.stringify({
    from: FROM,
    to: RECIPIENTS,
    subject,
    html,
    attachments: [{ filename: basename(PDF), content: pdfB64 }],
  });
  console.log(`Email: sending "${subject}" to ${RECIPIENTS.length} recipient(s) (idempotency key ${IDEMPOTENCY_KEY}).`);

  let last = { code: 0, body: '' };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = await post(payloadJson);
    const { code, body } = last;
    if (code >= 200 && code < 300) {
      console.log(`Email: sent to ${RECIPIENTS.length} recipient(s). API ${code}.`);
      return recordSend({ editionLabel, editionGeneratedAt, apiCode: code });
    }
    // Same idempotency key already used: this month's edition was already accepted by the
    // provider (e.g. a run whose send succeeded but whose log commit didn't). Don't resend.
    if (code === 409 && /idempoten/i.test(body)) {
      console.log(`::warning::Email API says this send was already made (409: ${body.slice(0, 200)}) — recording it, not resending.`);
      return recordSend({ editionLabel, editionGeneratedAt, apiCode: code, note: 'already accepted by the provider (idempotency key)' });
    }
    const transient = code === 0 || code === 429 || code >= 500;
    if (!transient || attempt === ATTEMPTS) break;
    const wait = 5000 * 3 ** (attempt - 1); // 5s, 15s, 45s, 135s
    console.log(`Email: attempt ${attempt} failed (${code || 'network'}: ${body.slice(0, 200)}); retrying in ${wait / 1000}s…`);
    await sleep(wait);
  }
  throw new Error(`Email API returned ${last.code ? `HTTP ${last.code}` : 'a network error'}: ${last.body.slice(0, 300)}`);
}

run().catch((e) => {
  console.error('send-newsletter-email failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
