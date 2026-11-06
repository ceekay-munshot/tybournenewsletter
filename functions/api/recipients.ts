// Newsletter recipient manager — the Cloudflare Pages Function behind the
// dashboard subscribe box. It lives at /api/recipients: Cloudflare Pages maps the
// file functions/api/recipients.ts to that route automatically, so no router or
// Worker entry is needed (the rest of the site is the static SPA in dist/).
//
// Anyone can SUBSCRIBE (POST their email) — no password, like any newsletter form.
// Viewing the full list and removing someone are admin-only (ADMIN_TOKEN), so the
// list stays private and only an admin can remove. It only ever reads/writes
// clients/<client>/data/recipients.json via the GitHub Contents API, so even a bug
// cannot write anywhere else in the repo. Emails are validated and the list is capped.
//
// Vars/secrets (set on the Pages project → Settings → Variables and secrets, NOT in the repo):
//   GITHUB_TOKEN   REQUIRED — a fine-grained GitHub token with Contents read/write on THIS repo only
//   ADMIN_TOKEN    optional — a password for the admin view/remove (subscribing never needs it)
//   GITHUB_REPO    optional, default "ceekay-munshot/tybournenewsletter"
//   CLIENT         optional, default "tybourne"

interface Env {
  ADMIN_TOKEN?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  CLIENT?: string;
}

const MAX_RECIPIENTS = 500;
const EMAIL_RE = /^[^\s@,<>()[\]";:\\]+@[^\s@,<>()[\]";:\\]+\.[^\s@,<>()[\]";:\\]+$/;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Constant-ish comparison so the admin token isn't trivially timing-probed. */
function tokenOk(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function bearer(request: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec((request.headers.get('authorization') ?? '').trim());
  return m ? m[1] : null;
}

const cleanEmail = (v: unknown): string | null => {
  const e = typeof v === 'string' ? v.trim() : '';
  return e && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
};

function gh(env: Env) {
  const repo = env.GITHUB_REPO || 'ceekay-munshot/tybournenewsletter';
  const client = env.CLIENT || 'tybourne';
  const base = `https://api.github.com/repos/${repo}/contents/clients/${client}/data/recipients.json`;
  const headers = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'tybourne-newsletter-recipients',
    'x-github-api-version': '2022-11-28',
  };
  return { base, headers };
}

interface Store {
  recipients: string[];
  updatedAt: string | null;
  sha?: string;
}

/** Read the committed recipients.json (plus its blob sha, needed to commit an update). */
async function readStore(env: Env): Promise<Store> {
  const { base, headers } = gh(env);
  const res = await fetch(`${base}?ref=main`, { headers });
  if (res.status === 404) return { recipients: [], updatedAt: null };
  if (!res.ok) throw new Error(`github read ${res.status}`);
  const data = (await res.json()) as { content?: string; sha?: string };
  let parsed: { recipients?: unknown; updatedAt?: unknown } = {};
  try {
    parsed = JSON.parse(atob((data.content ?? '').replace(/\n/g, '')));
  } catch {
    /* treat an unreadable file as empty, but keep the sha so we overwrite it cleanly */
  }
  const recipients = Array.isArray(parsed.recipients) ? parsed.recipients.map((s) => String(s).trim()).filter(Boolean) : [];
  return { recipients, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null, sha: data.sha };
}

async function writeStore(env: Env, recipients: string[], sha: string | undefined, action: string): Promise<Store> {
  const { base, headers } = gh(env);
  const updatedAt = new Date().toISOString();
  const body = {
    note: 'Newsletter recipients managed from the dashboard subscribe box (/api/recipients). Merged with NEWSLETTER_RECIPIENTS at send time.',
    recipients,
    updatedAt,
  };
  const content = btoa(`${JSON.stringify(body, null, 2)}\n`);
  const res = await fetch(base, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ message: `chore(recipients): ${action} [skip ci]`, content, sha, branch: 'main' }),
  });
  if (!res.ok) throw new Error(`github write ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return { recipients, updatedAt };
}

/** Handle /api/recipients:
 *   - POST   (public)      subscribe one email — no password, just a valid address
 *   - GET    (admin-only)  the full list
 *   - DELETE (admin-only)  remove one email
 *  Subscribing needs only GITHUB_TOKEN (to save the list); viewing/removing needs
 *  ADMIN_TOKEN, so the list stays private and nobody but an admin can remove. */
async function handleRecipients(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!env.GITHUB_TOKEN) return json({ error: 'not_configured', message: 'Set GITHUB_TOKEN on the Pages project.' }, 503);

  try {
    // ── Public subscribe — no auth, just an email. Never returns the list. ──
    if (request.method === 'POST') {
      const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
      const email = cleanEmail(payload?.email);
      if (!email) return json({ error: 'invalid_email', message: 'Enter a valid email address.' }, 400);
      const store = await readStore(env);
      if (store.recipients.some((e) => e.toLowerCase() === email.toLowerCase())) return json({ ok: true, subscribed: true, already: true });
      if (store.recipients.length >= MAX_RECIPIENTS) return json({ error: 'list_full', message: 'The subscriber list is full.' }, 400);
      await writeStore(env, [...store.recipients, email], store.sha, `subscribe (${store.recipients.length + 1})`);
      return json({ ok: true, subscribed: true });
    }

    // ── Admin only: view / remove. Requires ADMIN_TOKEN. ──
    if (!env.ADMIN_TOKEN) return json({ error: 'not_configured', message: 'Set ADMIN_TOKEN on the Pages project to view or remove.' }, 503);
    if (!tokenOk(bearer(request), env.ADMIN_TOKEN)) return json({ error: 'unauthorized' }, 401);

    if (request.method === 'GET') {
      const store = await readStore(env);
      return json({ recipients: store.recipients, updatedAt: store.updatedAt });
    }

    if (request.method === 'DELETE') {
      const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
      const email = cleanEmail(payload?.email);
      if (!email) return json({ error: 'invalid_email' }, 400);
      const store = await readStore(env);
      const without = store.recipients.filter((e) => e.toLowerCase() !== email.toLowerCase());
      if (without.length === store.recipients.length) return json({ recipients: store.recipients, updatedAt: store.updatedAt }); // not present → no-op
      return json(await writeStore(env, without, store.sha, `remove a recipient (${without.length})`));
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    return json({ error: 'server_error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// Pages Function entry — Cloudflare routes every HTTP method for /api/recipients
// here, so the one handler dispatches on request.method (POST public; GET/DELETE admin).
export const onRequest = (context: { request: Request; env: Env }): Promise<Response> =>
  handleRecipients(context.request, context.env);
