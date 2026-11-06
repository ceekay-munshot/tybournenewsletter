// "Email it to me now" — the Cloudflare Pages Function behind the dashboard's
// on-demand send. Lives at /api/send-now (Pages maps the file name to the route).
//
// It does NOT render or send the email itself. Instead it starts the real, tested
// monthly sender (the "Email monthly newsletter" GitHub Actions workflow) aimed at
// ONE address, via that workflow's `recipient_override` input. So the requester gets
// the exact same edition the monthly job produces — rich HTML body AND the PDF
// attachment — and because it's an override run it forces past the "already sent this
// month" gate and is NOT recorded as the monthly send (the real monthly send still
// goes out to everyone as normal). The send takes ~1-2 minutes to arrive (CI renders
// the PDF), so the UI says "on its way" rather than "sent".
//
// No subscription is required — anyone can ask for the current edition to be sent to
// their own address. Each request starts one CI run and sends one email, and every
// recipient is recorded in the workflow run history. Because it's a public endpoint
// that spends resources per call, put bot protection in front of it (e.g. Cloudflare
// Turnstile) before heavy public exposure. The address is validated and must be a
// single mailbox (the regex rejects commas), so it can't be used to fan out to a list.
//
// Vars/secrets (set on the Pages project → Settings → Variables and secrets):
//   GITHUB_TOKEN   REQUIRED — a fine-grained GitHub token on THIS repo with
//                  **Contents: read/write** (shared with /api/recipients) AND
//                  **Actions: read/write** (so it may start the workflow).
//   GITHUB_REPO    optional, default "ceekay-munshot/tybournenewsletter"
//   SEND_WORKFLOW  optional, default "newsletter-email.yml"
//   SEND_REF       optional, default "main" (branch the workflow runs from)

interface Env {
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
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

/** Start the monthly sender for ONE address via the workflow's recipient_override input. */
async function dispatchSend(env: Env, email: string): Promise<void> {
  const repo = env.GITHUB_REPO || 'ceekay-munshot/tybournenewsletter';
  const workflow = env.SEND_WORKFLOW || 'newsletter-email.yml';
  const ref = env.SEND_REF || 'main';
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'tybourne-newsletter-send-now',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ref, inputs: { recipient_override: email } }),
  });
  if (res.status === 204) return; // success — workflow queued
  const detail = (await res.text()).slice(0, 200);
  // 403 here almost always means the token is missing the "Actions: read/write" scope.
  if (res.status === 403) throw new Error(`github dispatch 403 — the GITHUB_TOKEN likely needs "Actions: read/write" added. ${detail}`);
  throw new Error(`github dispatch ${res.status}: ${detail}`);
}

/** POST /api/send-now { email } — queue an immediate send of the current edition to
 *  that address. No subscription needed. */
async function handleSendNow(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.GITHUB_TOKEN) return json({ error: 'not_configured', message: 'Set GITHUB_TOKEN on the Pages project.' }, 503);

  try {
    const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = cleanEmail(payload?.email);
    if (!email) return json({ error: 'invalid_email', message: 'Enter a valid email address.' }, 400);

    await dispatchSend(env, email);
    return json({ ok: true, queued: true, message: 'On its way — the latest edition will arrive in a minute or two.' }, 202);
  } catch (e) {
    return json({ error: 'server_error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// Pages Function entry — Cloudflare routes /api/send-now here.
export const onRequest = (context: { request: Request; env: Env }): Promise<Response> =>
  handleSendNow(context.request, context.env);
