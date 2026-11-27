import { huggingFaceBlock } from '../../../scripts/lib/huggingface-block.mjs';
import { finishBlock } from '../../../scripts/lib/changeBlock.mjs';
import config from '../../../clients/tybourne/client.config.json';
// Only files historically served by the upstream public dashboard are exposed.
const filePattern = /^(?:index|classifier|series|series-matrix|insights|(?:coverage|narrative)\/\d{4}-\d{2}-\d{2}|use-case-spaces\/[a-z0-9-]+)\.json$/;
const headers = { 'content-type': 'application/json', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' };
export async function onRequestGet({ env, params }) {
  const path = [].concat(params.path || []).join('/');
  if (path !== 'pair' && path !== 'block' && !filePattern.test(path)) return new Response('Missing feed file', { status: 404 });
  const pointer = await env.HF_DATA.get('live.json');
  if (!pointer) return new Response('Feed is not ready', { status: 503 });
  const manifest = await pointer.json();
  async function file(name) {
    const hash = manifest.files['public/data/' + name];
    return /^[a-f0-9]{64}$/.test(hash || '') && await env.HF_DATA.get('blobs/' + hash);
  }
  if (path === 'pair' || path === 'block') {
    const [series, insights] = await Promise.all([file('series.json'), file('insights.json')]);
    if (!series || !insights) return new Response('Incomplete release', { status: 503 });
    const pair = { week: manifest.week, series: await series.json(), insights: await insights.json() };
    if (path === 'pair') return Response.json(pair, { headers });
    const system = config.systems.find(s => s.id === 'huggingface');
    return Response.json(finishBlock(huggingFaceBlock(system, pair.insights, pair.series)), { headers });
  }
  const obj = await file(path);
  return obj ? new Response(obj.body, { headers: { ...headers, etag: obj.httpEtag } }) : new Response('Missing feed file', { status: 404 });
}
