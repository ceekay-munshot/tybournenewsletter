// Gate checks for the monthly workflows. Pure Node built-ins (no npm install needed).
//
//   node scripts/edition-check.mjs edition
//     Is this month's AI edition due? Writes `due=true|false` to $GITHUB_OUTPUT.
//     Due from the 2nd 06:00 UTC until an OK edition has been written this month, so
//     every refresh run retries until one lands. FORCE_EDITION=true forces it.
//
//   node scripts/edition-check.mjs current
//     Is this month's OK edition on file? Writes `current=true|false`.
//
//   node scripts/edition-check.mjs email
//     Should the newsletter email go out now? Writes `send=true|false` and `month=YYYY-MM`.
//       - email not configured                → FAIL (loud — it used to skip silently)
//       - already sent this month             → skip quietly (success)
//       - this month's edition not written yet → wait quietly until the deadline, then FAIL
//       - otherwise                           → send
//     FORCE=true sends even if already sent / edition not ready (manual resend).
//
// Env: CLIENT (default tybourne), EDITION_NOW (fake "now", for dry runs),
//      EMAIL_TOKEN + NEWSLETTER_RECIPIENTS (email mode: presence is checked, never printed).
import { readFile, appendFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nowUtc,
  monthKey,
  editionWindowStart,
  editionDeadline,
  isEditionDue,
  isCurrentEdition,
  describeEdition,
  emailLogFile,
  sentEntry,
} from './lib/edition.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = process.env.CLIENT || 'tybourne';
const truthy = (v) => /^(1|true|yes)$/i.test(String(v ?? '').trim());

async function readJson(rel) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, rel), 'utf8'));
  } catch {
    return null;
  }
}

async function output(key, value) {
  console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

// GitHub annotations: these show on the run page (and an error fails the step).
const notice = (msg) => console.log(`::notice::${msg}`);
const fail = async (msg) => {
  console.log(`::error::${msg}`);
  await summary(`### ❌ ${msg}`);
  process.exitCode = 1;
};

async function editionMode() {
  const now = nowUtc();
  const nl = await readJson(`clients/${CLIENT}/data/newsletter.json`);
  const current = isCurrentEdition(nl, now);
  console.log(`Edition on file: ${describeEdition(nl)}`);

  if (truthy(process.env.FORCE_EDITION)) {
    console.log('AI edition forced by hand (ai_edition ticked).');
    return output('due', 'true');
  }
  if (!isEditionDue(now)) {
    console.log(`Not due: this month's edition is written from ${editionWindowStart(now).toISOString()}.`);
    return output('due', 'false');
  }
  if (current) {
    console.log(`Not due: this month's edition is already written.`);
    return output('due', 'false');
  }
  notice(`This month's AI edition is due and not written yet — this run will write it.`);
  return output('due', 'true');
}

async function currentMode() {
  const nl = await readJson(`clients/${CLIENT}/data/newsletter.json`);
  console.log(`Edition on file: ${describeEdition(nl)}`);
  return output('current', String(isCurrentEdition(nl, nowUtc())));
}

async function emailMode() {
  const now = nowUtc();
  const month = monthKey(now);
  await output('month', month);
  const force = truthy(process.env.FORCE);

  const hasToken = Boolean(process.env.EMAIL_TOKEN);
  const recipients = (process.env.NEWSLETTER_RECIPIENTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!hasToken || !recipients.length) {
    const missing = [!hasToken && 'EMAIL_TOKEN (secret)', !recipients.length && 'NEWSLETTER_RECIPIENTS (variable)']
      .filter(Boolean)
      .join(' and ');
    await output('send', 'false');
    return fail(
      `Newsletter email is NOT configured: ${missing} not set, so nothing can be sent. ` +
        `Add it under Settings → Secrets and variables → Actions, then re-run this workflow.`,
    );
  }

  const log = await readJson(emailLogFile(CLIENT));
  const sent = sentEntry(log, month);
  if (sent && !force) {
    notice(`This month's newsletter (${month}) already went out on ${sent.sentAt} — nothing to do.`);
    return output('send', 'false');
  }

  const nl = await readJson(`clients/${CLIENT}/data/newsletter.json`);
  console.log(`Edition on file: ${describeEdition(nl)}`);
  if (!isCurrentEdition(nl, now) && !force) {
    await output('send', 'false');
    if (!isEditionDue(now)) {
      notice(`This month's edition is written from ${editionWindowStart(now).toISOString()} — not sending yet.`);
      return;
    }
    if (now < editionDeadline(now)) {
      notice(
        `Waiting for this month's AI edition (the refresh workflow writes it and then triggers this email). ` +
          `Will keep retrying; becomes an error after ${editionDeadline(now).toISOString()}.`,
      );
      return;
    }
    return fail(
      `This month's AI edition still hasn't been written (${describeEdition(nl)}), so the newsletter has not been sent. ` +
        `Check the latest "Refresh consolidated data" run (Generate AI newsletter step) and the BEDROCK_API_KEY secret. ` +
        `To send the current edition anyway, run this workflow by hand with "force" ticked.`,
    );
  }

  console.log(`${force ? 'Forced send' : 'Ready'}: sending ${month} to ${recipients.length} recipient(s).`);
  return output('send', 'true');
}

const mode = process.argv[2];
const run = { edition: editionMode, current: currentMode, email: emailMode }[mode];
if (!run) {
  console.error('usage: node scripts/edition-check.mjs <edition|current|email>');
  process.exit(2);
}
run().catch((e) => {
  console.error(`edition-check ${mode} failed:`, e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
