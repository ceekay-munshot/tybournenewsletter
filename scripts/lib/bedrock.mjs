/**
 * Minimal AWS Bedrock **Converse** client — single bearer key, no AWS SDK, no SigV4.
 * (Pattern adapted from the FDC/paramemo briefs client.)
 *
 * Auth is a Bedrock API key sent as `Authorization: Bearer $BEDROCK_API_KEY`
 * (the long-/short-term keys minted in the Bedrock console). Region + the model
 * fallback chain come from env:
 *   AWS_REGION         e.g. us-east-1
 *   BEDROCK_MODEL_IDS  comma-separated inference-profile IDs tried in order, e.g.
 *     "us.anthropic.claude-sonnet-4-5-20250929-v1:0,us.anthropic.claude-3-5-sonnet-20241022-v2:0"
 *
 * Fallback policy: try each model in order; a 400/403/404 means "can't use this
 * model" -> fall through to the next; a 429/5xx is transient -> retry the same
 * model with exponential backoff. The model that actually answered is returned so
 * the newsletter can be stamped with it. Shells out to curl (one code path works
 * through the agent proxy locally and direct on CI runners).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REGION = process.env.AWS_REGION || 'us-east-1';
const KEY = process.env.BEDROCK_API_KEY || '';
const MODELS = (process.env.BEDROCK_MODEL_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function bedrockConfigured() {
  return !!KEY && MODELS.length > 0;
}

export function bedrockStatus() {
  return {
    hasKey: !!KEY,
    region: REGION,
    models: MODELS,
    reason: !KEY
      ? 'BEDROCK_API_KEY is not set'
      : MODELS.length === 0
        ? 'BEDROCK_MODEL_IDS is not set'
        : null,
  };
}

async function converseOnce(modelId, payload, timeout) {
  const url = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
  const args = [
    '-sS', '--location', '--compressed', '--max-time', String(timeout),
    '-X', 'POST',
    '-H', `Authorization: Bearer ${KEY}`,
    '-H', 'Content-Type: application/json',
    '-H', 'Accept: application/json',
    '--data-binary', JSON.stringify(payload),
    '-w', '\n%{http_code}',
    url,
  ];
  const { stdout } = await pExecFile('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const nl = stdout.lastIndexOf('\n');
  const status = parseInt(stdout.slice(nl + 1).trim(), 10);
  return { status: Number.isFinite(status) ? status : 0, body: stdout.slice(0, nl) };
}

/**
 * Converse with the fallback chain.
 * @returns {Promise<{ text: string, modelId: string, usage: object|null, stopReason: string|null }>}
 */
export async function converse({ system, user, maxTokens = 4096, retries = 4, timeout = 120, label = 'converse' }) {
  if (!bedrockConfigured()) throw new Error(`Bedrock not configured: ${bedrockStatus().reason}`);
  const payload = {
    messages: [{ role: 'user', content: [{ text: user }] }],
    inferenceConfig: { maxTokens },
  };
  if (system) payload.system = [{ text: system }];

  let lastErr = null;
  for (const modelId of MODELS) {
    for (let attempt = 0; attempt < retries; attempt++) {
      let res;
      try {
        res = await converseOnce(modelId, payload, timeout);
      } catch (e) {
        lastErr = new Error(`${label}: ${modelId} transport error — ${e.stderr || e.message}`);
        if (attempt < retries - 1) await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (res.status >= 200 && res.status < 300) {
        let data;
        try {
          data = JSON.parse(res.body);
        } catch {
          lastErr = new Error(`${label}: ${modelId} returned non-JSON`);
          break;
        }
        const text = (data.output?.message?.content || []).map((c) => c.text || '').join('').trim();
        return { text, modelId, usage: data.usage || null, stopReason: data.stopReason || null };
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${label}: ${modelId} → HTTP ${res.status}`);
        if (attempt < retries - 1) await sleep(2000 * 2 ** attempt);
        continue;
      }
      lastErr = new Error(`${label}: ${modelId} → HTTP ${res.status} ${res.body.slice(0, 160).replace(/\s+/g, ' ')}`);
      break;
    }
  }
  throw new Error(`All Bedrock models failed (${MODELS.length} tried). Last: ${lastErr?.message || 'unknown'}`);
}

/** Pull the JSON object out of a model reply (tolerates ```json fences or stray prose). */
export function parseJson(text) {
  if (!text) return null;
  let t = text.trim();
  // strip ```json ... ``` fences if present
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // else try to isolate the outermost object
  if (!t.startsWith('{')) {
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export const bedrockRegion = REGION;
export const bedrockModels = MODELS;
