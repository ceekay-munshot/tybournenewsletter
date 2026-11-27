import { meter } from '../lib/hf-budget.js';
const hash = '[a-f0-9]{64}';
const objectKey = new RegExp('^(?:blobs/' + hash + '|state/' + hash + '|checkpoints/[0-3]/part-[0-9]{4}|history/weekly-\\d{4}-\\d{2}-\\d{2}\\.json|live\\.json|resume\\.json)$');
export async function onRequest({ env, request }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const budget = key === 'meter';
  const secret = budget ? env.HF_METER_TOKEN : env.HF_RUNNER_TOKEN;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) return new Response(null, { status: 401 });
  if (budget && request.method === 'POST') return meter(env.HF_DATA, await request.json());
  if (!objectKey.test(key)) return new Response(null, { status: 404 });
  if (request.method === 'GET' || request.method === 'HEAD') {
    const obj = request.method === 'HEAD' ? await env.HF_DATA.head(key) : await env.HF_DATA.get(key);
    return obj ? new Response(obj.body ?? null, { headers: { etag: obj.httpEtag, 'cache-control': 'no-store' } }) : new Response(null, { status: 404 });
  }
  if (request.method !== 'PUT') return new Response(null, { status: 405 });
  const digest = /^(?:blobs|state)\/([a-f0-9]{64})$/.exec(key)?.[1];
  const chunk = key.startsWith('checkpoints/') && request.headers.get('x-content-sha256');
  if (key.startsWith('checkpoints/') && !/^[a-f0-9]{64}$/.test(chunk || '')) return new Response('Invalid checksum', { status: 400 });
  const match = request.headers.get('if-match');
  const absent = request.headers.get('if-none-match') === '*';
  if (!digest && !chunk && !match && !absent) return new Response('Precondition required', { status: 428 });
  const result = await env.HF_DATA.put(key, request.body, {
    ...(digest || chunk ? { sha256: digest || chunk } : {}),
    ...(match ? { onlyIf: { etagMatches: match.replace(/^"|"$/g, '') } } : absent ? { onlyIf: { etagDoesNotMatch: '*' } } : {}),
  });
  return new Response(null, { status: result ? 200 : 412 });
}
