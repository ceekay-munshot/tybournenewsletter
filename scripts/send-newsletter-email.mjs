// Email the rendered quarterly newsletter PDF to the recipient list.
//
// Transport is a single bearer-token HTTP API (Resend by default — api.resend.com),
// so there is no SMTP setup and it works from CI through a proxy. Shells out to curl
// for one proxy-safe code path.
//
// Honest skip: if EMAIL_TOKEN or NEWSLETTER_RECIPIENTS is unset, it logs and exits 0
// (0 = success) — the pipeline never fails just because email isn't configured.
//
// Env:
//   EMAIL_TOKEN             bearer key for the email API (required to send)
//   NEWSLETTER_RECIPIENTS   comma-separated recipient addresses (required to send)
//   EMAIL_FROM             "Name <from@domain>"  (default below)
//   EMAIL_API_URL          default https://api.resend.com/emails
//   NEWSLETTER_PDF         path to the PDF (default ./tybourne-intelligence.pdf)
//   CLIENT                 client folder (default tybourne)
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function run() {
  if (!TOKEN || !RECIPIENTS.length) {
    console.log('Email: EMAIL_TOKEN or NEWSLETTER_RECIPIENTS not set — skipping send (this is fine).');
    return; // exit 0
  }
  if (!existsSync(PDF)) {
    throw new Error(`PDF not found at ${PDF} — run scripts/render-newsletter-pdf.mjs first.`);
  }

  // Pull the edition label + client name for the subject/body (real data only).
  let editionLabel = 'monthly edition';
  let clientName = 'Tybourne Global Holdings';
  let status = 'unknown';
  try {
    const nl = JSON.parse(await readFile(resolve(ROOT, `clients/${CLIENT}/data/newsletter.json`), 'utf8'));
    if (nl.editionLabel) editionLabel = nl.editionLabel;
    if (nl.status) status = nl.status;
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
      ? 'The AI editorial edition is attached.'
      : 'The data edition is attached (AI prose off — figures are live and source-stamped, nothing fabricated).';
  const html =
    `<div style="font-family:Inter,system-ui,sans-serif;color:#334155;line-height:1.6">` +
    `<h2 style="font-family:'Space Grotesk',Inter,sans-serif;color:#0f172a;margin:0 0 6px">${clientName} Intelligence</h2>` +
    `<p style="margin:0 0 12px;color:#64748b">${editionLabel}</p>` +
    `<p style="margin:0 0 12px">${editionNote}</p>` +
    `<p style="margin:0;color:#94a3b8;font-size:13px">Published by Munshot · 100% real data, every figure source-stamped.</p>` +
    `</div>`;

  const payload = {
    from: FROM,
    to: RECIPIENTS,
    subject,
    html,
    attachments: [{ filename: basename(PDF), content: pdfB64 }],
  };

  const args = [
    '-sS', '--location', '--max-time', '120', '-X', 'POST',
    '-H', `Authorization: Bearer ${TOKEN}`,
    '-H', 'Content-Type: application/json',
    '--data-binary', JSON.stringify(payload),
    '-w', '\n%{http_code}',
    API_URL,
  ];
  const { stdout } = await pExecFile('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const nl = stdout.lastIndexOf('\n');
  const code = parseInt(stdout.slice(nl + 1).trim(), 10);
  const body = stdout.slice(0, nl);

  if (code >= 200 && code < 300) {
    console.log(`Email: sent to ${RECIPIENTS.length} recipient(s). API ${code}.`);
  } else {
    throw new Error(`Email API returned HTTP ${code}: ${body.slice(0, 300)}`);
  }
}

run().catch((e) => {
  console.error('send-newsletter-email failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
