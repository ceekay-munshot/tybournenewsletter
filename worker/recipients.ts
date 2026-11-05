// Newsletter recipient manager — the API behind the dashboard admin panel.
//
// Admin-gated read/write of clients/<client>/data/recipients.json, committed via the
// GitHub Contents API. This is the ONLY file it ever touches, so even a bug cannot
// write anywhere else in the repo. Every method requires the admin token, so the
// recipient list is never publicly readable.
//
// Vars/secrets (set on the Worker, NOT in the repo):
//   ADMIN_TOKEN    a password you choose; the dashboard sends it as `Authorization: Bearer <token>`
//   GITHUB_TOKEN   a fine-grained GitHub token with Contents read/write on THIS repo only
//   GITHUB_REPO    optional, default "ceekay-munshot/tybournenewsletter"
//   CLIENT         optional, default "tybourne"

export interface Env {
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
    note: 'Newsletter recipients managed from the dashboard admin panel (/?admin=recipients). Merged with NEWSLETTER_RECIPIENTS at send time.',
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

/** Handle /api/recipients (GET list, POST add, DELETE remove). */
export async function handleRecipients(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!env.ADMIN_TOKEN || !env.GITHUB_TOKEN) {
    return json({ error: 'not_configured', message: 'Set ADMIN_TOKEN and GITHUB_TOKEN on the Worker.' }, 503);
  }
  if (!tokenOk(bearer(request), env.ADMIN_TOKEN)) return json({ error: 'unauthorized' }, 401);

  try {
    if (request.method === 'GET') {
      const store = await readStore(env);
      return json({ recipients: store.recipients, updatedAt: store.updatedAt });
    }

    if (request.method === 'POST' || request.method === 'DELETE') {
      const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
      const email = cleanEmail(payload?.email);
      if (!email) return json({ error: 'invalid_email' }, 400);

      const store = await readStore(env);
      const lower = email.toLowerCase();
      const without = store.recipients.filter((e) => e.toLowerCase() !== lower);

      if (request.method === 'POST') {
        if (without.length >= MAX_RECIPIENTS) return json({ error: 'list_full', message: `At most ${MAX_RECIPIENTS} recipients.` }, 400);
        if (without.length !== store.recipients.length) return json({ recipients: store.recipients, updatedAt: store.updatedAt }); // already present → no-op
        const next = [...store.recipients, email];
        return json(await writeStore(env, next, store.sha, `add a recipient (${next.length})`));
      }

      // DELETE
      if (without.length === store.recipients.length) return json({ recipients: store.recipients, updatedAt: store.updatedAt }); // not present → no-op
      return json(await writeStore(env, without, store.sha, `remove a recipient (${without.length})`));
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    return json({ error: 'server_error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
}
