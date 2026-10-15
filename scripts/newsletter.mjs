// Bedrock AI newsletter writer. Reads the consolidated data, asks Claude (on Bedrock)
// for a strict JSON briefing built ONLY from the real figures, and writes
// clients/<client>/data/newsletter.json. Honest no-key state when unconfigured;
// caches on a hash of the data so an unchanged dataset skips the model call.
//
// Usage: CLIENT=tybourne node scripts/newsletter.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { converse, bedrockConfigured, bedrockStatus, bedrockRegion } from './lib/bedrock.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIENT = process.env.CLIENT || 'tybourne';
const dataPath = resolve(ROOT, `clients/${CLIENT}/data/consolidated.json`);
const outPath = resolve(ROOT, `clients/${CLIENT}/data/newsletter.json`);

/** Format a headline change exactly as the UI does (pct | pp | pts). */
function formatChange(b) {
  if (b.changeDisplay === 'pp' || b.changeDisplay === 'pts') {
    if (b.changeAbs == null || !Number.isFinite(b.changeAbs)) return '—';
    const a = Math.abs(b.changeAbs);
    const dp = a >= 1 ? 1 : 2;
    return `${b.changeAbs > 0 ? '+' : ''}${b.changeAbs.toFixed(dp)} ${b.changeDisplay}`;
  }
  if (b.changePct == null || !Number.isFinite(b.changePct)) return '—';
  const v = b.changePct * 100;
  const r = v.toFixed(1);
  const n = parseFloat(r);
  if (n > 0) return `+${r}%`;
  if (n === 0) return `${Math.abs(n).toFixed(1)}%`;
  return `${r}%`;
}

/** Format a breakdown row's change honouring its (or the block's) display kind. */
function formatRow(r, b) {
  return formatChange({
    changeDisplay: r.changeDisplay ?? b.changeDisplay,
    changeAbs: r.changeAbs,
    changePct: r.changePct,
  });
}

function buildData(data) {
  const systems = (data.systems || [])
    .filter((b) => b.status !== 'error')
    .map((b) => {
      const availableViews = (b.views || []).filter((v) => v.available).map((v) => v.label);
      const row = {
        systemId: b.systemId,
        name: b.name,
        metric: b.metricLabel,
        comparison: b.comparison,
        period: `${b.lastPeriodLabel} → ${b.thisPeriodLabel}`,
        change: formatChange(b),
        direction: b.direction,
        // the toggles this dashboard honestly supports (so the prose can say so)
        availableViews: availableViews.length ? availableViews : undefined,
        // fuller breakdown (up to 8), change formatted the way the UI shows it
        breakdown: (b.breakdown || [])
          .filter((r) => r.changePct != null || r.changeAbs != null || r.thisValue != null)
          .slice(0, 8)
          .map((r) => ({ label: r.label, change: formatRow(r, b), bigMove: r.bigMove || undefined, note: r.note || undefined })),
        // the lifted "why it moved" — the generator should ground explanations in these
        insights: (b.insights || []).map((i) => ({ title: i.title, body: i.body || undefined, bullets: i.bullets || undefined })),
        summary: b.summary || null,
        notes: b.notes || null,
        source: b.sourceName,
      };
      if (b.highlights?.length) row.themes = b.highlights;
      if (b.tone) row.tone = b.tone;
      return row;
    });
  // NB: no `generatedAt` here — the hash must track the *figures*, not the pipeline
  // run time, so an unchanged dataset keeps the cached edition and skips Bedrock.
  return { client: data.client?.name, systems };
}

const SYSTEM_PROMPT =
  'Write a detailed monthly intelligence briefing for Tybourne Global Holdings, published by Munshot. ' +
  'Give EVERY dashboard in DATA.systems its own entry in "lines" (match systemId exactly). ' +
  'Each line is 2-3 sentences: state the exact headline figure with BOTH periods verbatim, name the key breakdown movers, ' +
  'and explain WHY it moved using that dashboard\'s own `insights` and `summary` — do not invent causes. ' +
  'Use ONLY numbers present in DATA, verbatim (never re-round). Plain, sharp, buyer-ready English, no hype. ' +
  'Return ONLY the JSON object.';

const SCHEMA = `{
  "editionLabel": "October 2026 — monthly intelligence",
  "executiveSummary": "4-6 sentences on the biggest cross-dashboard moves this period",
  "lines": [ {"systemId":"<exact id from DATA>","line":"2-3 sentences: exact headline figure + both periods, key breakdown movers, and why it moved (grounded in that dashboard's insights)"} ],
  "watchList": [ "3-5 forward-looking bullets, each grounded in a DATA figure" ],
  "methodNote": "one line: where the data comes from; nothing is fabricated" }`;

function userMessage(DATA, strict = false) {
  return (
    (strict ? 'Your previous reply was not valid JSON. Return ONLY the JSON object — no markdown fences, no commentary.\n\n' : '') +
    `DATA:\n\`\`\`json\n${JSON.stringify(DATA, null, 2)}\n\`\`\`\n\n` +
    `Return ONLY this JSON shape (no markdown, no prose):\n${SCHEMA}`
  );
}

function parseJson(text) {
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

const valid = (o) =>
  o &&
  typeof o.editionLabel === 'string' &&
  typeof o.executiveSummary === 'string' &&
  Array.isArray(o.lines) &&
  Array.isArray(o.watchList) &&
  typeof o.methodNote === 'string';

async function write(obj) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

async function run() {
  const data = JSON.parse(await readFile(dataPath, 'utf8'));
  const DATA = buildData(data);
  const dataHash = createHash('sha256').update(JSON.stringify(DATA)).digest('hex').slice(0, 16);

  let existing = null;
  try {
    existing = JSON.parse(await readFile(outPath, 'utf8'));
  } catch {
    /* none yet */
  }
  if (existing?.status === 'ok' && existing?.dataHash === dataHash) {
    console.log('Newsletter: data unchanged (hash match) — keeping existing AI edition, skipping Bedrock.');
    return;
  }

  if (!bedrockConfigured()) {
    const s = bedrockStatus();
    await write({
      generatedAt: new Date().toISOString(),
      status: 'no-key',
      provider: 'bedrock',
      region: s.region,
      dataHash,
      note: `AI newsletter not generated: ${s.reason}. Set a Bedrock key to enable the AI writer.`,
      editionLabel: null,
      executiveSummary: null,
      lines: [],
      watchList: [],
      methodNote: null,
    });
    console.log(`Newsletter: Bedrock not configured (${s.reason}) — wrote honest no-key state.`);
    return;
  }

  try {
    let result = await converse({ system: SYSTEM_PROMPT, user: userMessage(DATA), maxTokens: 4096, label: 'newsletter' });
    let parsed = parseJson(result.text);
    if (!valid(parsed)) {
      console.log('Newsletter: first reply malformed — re-asking once.');
      result = await converse({ system: SYSTEM_PROMPT, user: userMessage(DATA, true), maxTokens: 4096, label: 'newsletter-retry' });
      parsed = parseJson(result.text);
    }
    if (!valid(parsed)) {
      await write({
        generatedAt: new Date().toISOString(),
        status: 'error',
        provider: 'bedrock',
        model: result.modelId,
        region: bedrockRegion,
        dataHash,
        note: 'The model returned malformed JSON twice; no newsletter written (nothing fabricated).',
        editionLabel: null,
        executiveSummary: null,
        lines: [],
        watchList: [],
        methodNote: null,
      });
      console.log('Newsletter: malformed JSON after retry — wrote error state.');
      process.exitCode = 1;
      return;
    }
    await write({
      generatedAt: new Date().toISOString(),
      status: 'ok',
      provider: 'bedrock',
      model: result.modelId,
      region: bedrockRegion,
      dataHash,
      editionLabel: parsed.editionLabel,
      executiveSummary: parsed.executiveSummary,
      lines: parsed.lines,
      watchList: parsed.watchList,
      methodNote: parsed.methodNote,
    });
    console.log(`Newsletter: generated via ${result.modelId} (${bedrockRegion}).`);
  } catch (e) {
    await write({
      generatedAt: new Date().toISOString(),
      status: 'error',
      provider: 'bedrock',
      region: bedrockRegion,
      dataHash,
      note: `AI newsletter failed: ${e instanceof Error ? e.message : String(e)}`,
      editionLabel: null,
      executiveSummary: null,
      lines: [],
      watchList: [],
      methodNote: null,
    });
    console.log(`Newsletter: Bedrock call failed — ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error('newsletter failed:', e);
  process.exitCode = 1;
});
