// "Email me the latest edition now" — the Cloudflare Pages Function behind the
// dashboard's on-demand send. Lives at /api/send-now (Pages maps the file name to
// the route automatically).
//
// It does NOT render or send the email itself. Instead it starts the real, tested
// monthly sender (the "Email monthly newsletter" GitHub Actions workflow) aimed at
// ONE address, via that workflow's `recipient_override` input. So the requester gets
// the exact same edition the monthly job produces — rich HTML body AND the PDF
// attachment — and because it's an override run it forces past the "already sent this
// month" gate and is NOT recorded as the monthly send (the real monthly send still
// goes out to everyone as normal).
//
// Safety: it only sends to an address that is already on the subscriber list
// (clients/<client>/data/recipients.json). So it can't be used to blast the
// newsletter at arbitrary people — it only ever re-sends the current edition to
// someone who already opted in. The send takes ~1-2 minutes to arrive (CI renders
// the PDF), so the UI says "on its way" rather than "sent".
//
// Vars/secrets (set on the Pages project → Settings → Variables and secrets):
//   GITHUB_TOKEN   REQUIRED — a fine-grained GitHub token on THIS repo with
//                  **Contents: read/write** (shared with /api/recipients) AND
//                  **Actions: read/write** (so it may start the workflow).
//   GITHUB_REPO    optional, default "ceekay-munshot/tybournenewsletter"
//   CLIENT         optional, default "tybourne"
//   SEND_WORKFLOW  optional, default "newsletter-email.yml"
//   SEND_REF       optional, default "main" (branch the workflow runs from)

interface Env {
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  CLIENT?: string;
  SEND_WORKFLOW?: string;
  SEND_REF?: string;
}

const EMAIL_RE = /^[^\s@,<>()[\]";:\\]+@[^\s@,<>()[\]";:\\]+\.[^\s@,<>()[\]";:\\]+$/;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const cleanEmail = (v: unknown): string | null => {
  const e = typeof v === 'string' ? v.trim() : '';
  return e && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
};

function ghHeaders(env: Env) {
  return {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'tybourne-newsletter-send-now',
    'x-github-api-version': '2022-11-28',
  };
}

/** Is this address already a confirmed subscriber? (We only send to the opted-in list.) */
async function isSubscriber(env: Env, email: string): Promise<boolean> {
  const repo = env.GITHUB_REPO || 'ceekay-munshot/tybournenewsletter';
  const client = env.CLIENT || 'tybourne';
  const ref = env.SEND_REF || 'main';
  const url = `https://api.github.com/repos/${repo}/contents/clients/${client}/data/recipients.json?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return false; // no list yet
  if (!res.ok) throw new Error(`github read ${res.status}`);
  const data = (await res.json()) as { content?: string };
  let recipients: unknown = [];
  try {
    recipients = (JSON.parse(atob((data.content ?? '').replace(/\n/g, ''))) as { recipients?: unknown }).recipients;
  } catch {
    return false;
  }
  if (!Array.isArray(recipients)) return false;
  const target = email.toLowerCase();
  return recipients.some((e) => String(e).trim().toLowerCase() === target);
}

/** Start the monthly sender for ONE address via the workflow's recipient_override input. */
async function dispatchSend(env: Env, email: string): Promise<void> {
  const repo = env.GITHUB_REPO || 'ceekay-munshot/tybournenewsletter';
  const workflow = env.SEND_WORKFLOW || 'newsletter-email.yml';
  const ref = env.SEND_REF || 'main';
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...ghHeaders(env), 'content-type': 'application/json' },
    body: JSON.stringify({ ref, inputs: { recipient_override: email } }),
  });
  if (res.status === 204) return; // success — workflow queued
  const detail = (await res.text()).slice(0, 200);
  // 403 here almost always means the token is missing the "Actions: read/write" scope.
  if (res.status === 403) throw new Error(`github dispatch 403 — the GITHUB_TOKEN likely needs "Actions: read/write" added. ${detail}`);
  throw new Error(`github dispatch ${res.status}: ${detail}`);
}

/** POST /api/send-now { email } — queue an immediate send of the current edition to
 *  that address, but only if it's already on the subscriber list. */
async function handleSendNow(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.GITHUB_TOKEN) return json({ error: 'not_configured', message: 'Set GITHUB_TOKEN on the Pages project.' }, 503);

  try {
    const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = cleanEmail(payload?.email);
    if (!email) return json({ error: 'invalid_email', message: 'Enter a valid email address.' }, 400);

    if (!(await isSubscriber(env, email))) {
      return json({ error: 'not_subscribed', message: 'Subscribe first, then you can have the latest edition sent to you.' }, 403);
    }

    await dispatchSend(env, email);
    return json({ ok: true, queued: true, message: 'On its way — the latest edition will arrive in a minute or two.' }, 202);
  } catch (e) {
    return json({ error: 'server_error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// Pages Function entry — Cloudflare routes /api/send-now here.
export const onRequest = (context: { request: Request; env: Env }): Promise<Response> =>
  handleSendNow(context.request, context.env);
