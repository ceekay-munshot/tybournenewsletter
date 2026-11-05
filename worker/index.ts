// Cloudflare Worker entry (Workers static-assets site — see wrangler.jsonc).
// Routes /api/recipients to the recipient manager; everything else is the static
// SPA served from dist/ via the ASSETS binding, with an index.html fallback for an
// HTML navigation that doesn't match a file (the app's state lives on "/").
import { handleRecipients, type Env as RecipientsEnv } from './recipients';

export interface Env extends RecipientsEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/recipients') return handleRecipients(request, env);
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404 && request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
    }
    return res;
  },
};
