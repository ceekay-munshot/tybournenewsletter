// Resolve the newsletter recipient list from two sources, deduped case-insensitively:
//   1. clients/<client>/data/recipients.json  (managed from the dashboard admin panel)
//   2. the NEWSLETTER_RECIPIENTS env/variable  (legacy / fallback)
// Either source alone is enough. `exact: true` (a test-to-self run) uses ONLY the env
// value, so a test never fans out to the real managed list.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const split = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const k = e.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(e);
    }
  }
  return out;
}

/** Read the committed recipients.json list (empty on any problem). */
export async function fileRecipients(root, client) {
  try {
    const data = JSON.parse(await readFile(resolve(root, `clients/${client}/data/recipients.json`), 'utf8'));
    return Array.isArray(data.recipients) ? data.recipients.map((s) => String(s).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** The effective recipient list. With `exact`, only the env value is used. */
export async function resolveRecipients(root, client, envValue, { exact = false } = {}) {
  const env = split(envValue);
  if (exact) return dedupe(env);
  return dedupe([...(await fileRecipients(root, client)), ...env]);
}
