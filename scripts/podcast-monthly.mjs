// Podcast monthly summaries (Bedrock). The podcast dashboard writes one master summary per
// week from that week's episode analyses; this rolls a whole calendar month of those same
// inputs (grouped by week) into ONE consolidated summary per month — this month and last —
// then asks which themes continued, dropped off, or are new.
//
// Writes clients/<client>/data/podcast-monthly.json (what the dashboard reads) and
// clients/<client>/data/podcast-archive.json (every episode seen in the last 3 months, so a
// month stays whole after the feed's "latest few episodes per show" window moves on).
// Honest fallback with no key or a model error: months are built from the episode analyses
// as published and topics are matched by exact name — nothing is invented. Each month and
// the comparison are cached on a hash of their inputs, so an unchanged month never
// re-calls the model.
//
// Usage: CLIENT=tybourne node scripts/podcast-monthly.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson } from './lib/http.mjs';
import { monthOf } from './lib/quarters.mjs';
import { converse, bedrockConfigured, bedrockStatus, bedrockRegion, parseJson } from './lib/bedrock.mjs';
import {
  hashOf,
  addMonths,
  compactEpisode,
  mergeArchive,
  monthMeta,
  monthPack,
  fallbackMonth,
  applyMonthAI,
  comparePack,
  applyCompareAI,
  topicCompare,
} from './lib/podcastMonthly.mjs';
import { SHOW_LABEL } from './connectors/podcast.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIENT = process.env.CLIENT || 'tybourne';
const configPath = resolve(ROOT, `clients/${CLIENT}/client.config.json`);
const outPath = resolve(ROOT, `clients/${CLIENT}/data/podcast-monthly.json`);
const archivePath = resolve(ROOT, `clients/${CLIENT}/data/podcast-archive.json`);
const KEEP_MONTHS = 3;

const MONTH_SYSTEM =
  "You are the editor of Munshot's monthly investor-podcast brief for Tybourne Global Holdings, a global investment firm. " +
  "DATA holds every investor-podcast episode published in one calendar month, grouped by week — the same per-episode analyses the podcast dashboard's weekly summaries are written from. " +
  'Episodes with "summarised": true carry the full analysis (key points, synthesis, what changed, why it matters, numbers). ' +
  'The rest carry only the title and show notes: use them to see what was covered, but lean on the summarised episodes for substance. ' +
  'Write ONE consolidated summary of the whole month. Themes are threads that cut across episodes and shows, named in plain words (3-7 words) — never an episode title; ' +
  'order them by how much airtime they got and give 4-8 (fewer if the month is thin). ' +
  'Use ONLY facts in DATA: never invent numbers, names, quotes or causes, and copy every figure in "numbers" verbatim from DATA. ' +
  'Plain, sharp, investor-ready English, no hype. Return ONLY the JSON object.';

const MONTH_SCHEMA = `{
  "headline": "one sentence (max 30 words): the month's big picture across the shows",
  "overview": ["3 short paragraphs (2-4 sentences each): what the shows kept coming back to, where they agreed or disagreed, and what it means for investors"],
  "themes": [ {"title":"3-7 word theme name","summary":"2-3 sentences: what was said, by which shows/guests","shows":["show names exactly as in DATA.shows"],"episodeIds":["episode ids from DATA"],"strength":"major|minor"} ],
  "weeks": [ {"id":"<week id from DATA>","line":"1-2 sentences: what that week's episodes focused on"} ],
  "numbers": [ {"value":"figure copied verbatim from DATA (up to 6, the most telling)","metric":"what it measures","context":"who said it / which show"} ],
  "tone": "one sentence on the month's overall sentiment",
  "watch": ["2-4 open questions or threads to watch next month"] }`;

const COMPARE_SYSTEM =
  'You compare two consecutive months of investor-podcast themes for Tybourne Global Holdings. ' +
  'Match themes that are the same underlying thread even when worded differently — the same companies, technology, market or question discussed in both months (the companies may differ). ' +
  'A loose analogy or a shared abstract angle is NOT a match: when in doubt, the last-month theme is dropped and the this-month theme is new. ' +
  'Every theme in DATA.last goes in exactly one of "continued" or "dropped"; every theme in DATA.this goes in exactly one of "continued" or "new". ' +
  'Copy theme titles EXACTLY as given. Use only what DATA says; keep each note to one sentence. Return ONLY the JSON object.';

const COMPARE_SCHEMA = `{
  "read": "2-3 sentences: how the conversation shifted from last month to this month",
  "continued": [ {"last":"exact theme title from DATA.last","this":"exact theme title from DATA.this","note":"one sentence: how the thread evolved"} ],
  "dropped": [ {"theme":"exact theme title from DATA.last","note":"one sentence: what it was about"} ],
  "new": [ {"theme":"exact theme title from DATA.this","note":"one sentence: why it surfaced now"} ] }`;

function ask(DATA, schema, strict = false) {
  return (
    (strict ? 'Your previous reply was not valid JSON. Return ONLY the JSON object — no markdown fences, no commentary.\n\n' : '') +
    `DATA:\n\`\`\`json\n${JSON.stringify(DATA, null, 2)}\n\`\`\`\n\n` +
    `Return ONLY this JSON shape (no markdown, no prose):\n${schema}`
  );
}

/** One model call, validated by `apply`; re-asks once on malformed/invalid JSON. */
async function aiJson({ system, data, schema, maxTokens, label, apply }) {
  let res = await converse({ system, user: ask(data, schema), maxTokens, timeout: 180, label });
  let out = apply(parseJson(res.text));
  if (!out) {
    console.log(`  ${label}: first reply unusable — re-asking once.`);
    res = await converse({ system, user: ask(data, schema, true), maxTokens, timeout: 180, label: `${label}-retry` });
    out = apply(parseJson(res.text));
  }
  if (!out) throw new Error(`${label}: the model returned unusable JSON twice`);
  return { out, model: res.modelId };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJson(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

async function run() {
  const config = await readJson(configPath);
  const system = (config?.systems ?? []).find((s) => s.connector === 'podcast');
  if (!system?.source?.episodes) {
    console.log('Podcast monthly: no podcast system in the client config — skipping.');
    return;
  }
  const prev = await readJson(outPath);
  const prevArchive = (await readJson(archivePath))?.episodes ?? [];
  const show = (id) => SHOW_LABEL[id] || id || 'Other';

  let feed = [];
  try {
    const raw = await getJson(system.source.episodes);
    const list = Array.isArray(raw) ? raw : raw?.episodes || raw?.items || raw?.data || [];
    feed = list.filter((e) => e && e.id && e.publishedAt).map((e) => compactEpisode(e, show));
  } catch (e) {
    console.log(`Podcast monthly: episodes feed failed (${e instanceof Error ? e.message : e}) — using the archive only.`);
  }

  const archive = mergeArchive(prevArchive, feed, KEEP_MONTHS);
  if (!archive.length) {
    console.log('Podcast monthly: no episodes in the feed or the archive — nothing written.');
    return;
  }
  const thisId = archive.map((r) => monthOf(r.date)).sort().slice(-1)[0];
  const lastId = addMonths(thisId, -1);
  const recsOf = (ym) => archive.filter((r) => monthOf(r.date) === ym);

  const useAI = bedrockConfigured();
  const errors = [];

  async function buildMonth(ym) {
    const recs = recsOf(ym);
    const meta = monthMeta(ym, recs);
    if (!recs.length) return { ...fallbackMonth(meta, recs), inputHash: null };
    const pack = monthPack(meta, recs);
    const inputHash = hashOf(pack);
    const cached = [prev?.thisMonth, prev?.lastMonth].find((m) => m?.id === ym && m.ai && m.inputHash === inputHash);
    if (cached) {
      console.log(`  ${meta.label}: inputs unchanged — keeping the AI summary (${cached.model}).`);
      return cached;
    }
    if (!useAI) return { ...fallbackMonth(meta, recs), inputHash };
    try {
      const { out, model } = await aiJson({
        system: MONTH_SYSTEM,
        data: pack,
        schema: MONTH_SCHEMA,
        maxTokens: 6000,
        label: `podcast-month ${ym}`,
        apply: (o) => applyMonthAI(meta, pack, o),
      });
      console.log(`  ${meta.label}: AI summary written via ${model} (${out.themes.length} themes).`);
      return { ...out, model, inputHash };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      return { ...fallbackMonth(meta, recs), inputHash };
    }
  }

  const lastMonth = await buildMonth(lastId);
  const thisMonth = await buildMonth(thisId);

  let compare = null;
  if (lastMonth.episodes && thisMonth.episodes) {
    if (lastMonth.ai && thisMonth.ai) {
      const cpack = comparePack(lastMonth, thisMonth);
      const inputHash = hashOf(cpack);
      if (prev?.compare?.ai && prev.compare.inputHash === inputHash) {
        compare = prev.compare;
      } else if (useAI) {
        try {
          const { out, model } = await aiJson({
            system: COMPARE_SYSTEM,
            data: cpack,
            schema: COMPARE_SCHEMA,
            maxTokens: 2500,
            label: 'podcast-compare',
            apply: (o) => applyCompareAI(lastMonth, thisMonth, o),
          });
          compare = { ...out, model, inputHash };
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
    if (!compare) compare = topicCompare(recsOf(lastId), recsOf(thisId));
  }

  const s = bedrockStatus();
  const status = !useAI ? 'no-key' : errors.length ? 'error' : 'ok';
  const note =
    status === 'no-key'
      ? `AI monthly summary not generated: ${s.reason}. Showing the episode analyses as published; set a Bedrock key to enable it.`
      : status === 'error'
        ? `Some AI steps failed — those parts show the episode analyses as published. ${errors.join(' | ')}`
        : undefined;

  await writeJson(outPath, {
    generatedAt: new Date().toISOString(),
    systemId: system.id,
    status,
    provider: 'bedrock',
    region: bedrockRegion,
    note,
    sourceName: system.sourceName,
    sourceUrl: system.dashboardUrl || system.source.episodes,
    lastMonth,
    thisMonth,
    compare,
  });
  await writeJson(archivePath, { source: system.source.episodes, keepMonths: KEEP_MONTHS, episodes: archive });

  const line = (m) => `${m.label}: ${m.episodes} episodes (${m.summarised} analysed), ${m.themes.length} themes, ${m.ai ? 'AI' : 'no AI'}`;
  console.log(`Podcast monthly [${status}] — ${line(lastMonth)} → ${line(thisMonth)}; compare: ${compare ? compare.basis : 'none'}.`);
  if (note) console.log(`  ${note}`);
  if (status === 'error') process.exitCode = 1;
}

run().catch((e) => {
  console.error('podcast-monthly failed:', e);
  process.exitCode = 1;
});
