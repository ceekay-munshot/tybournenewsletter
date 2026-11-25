// Podcast monthly summaries (Bedrock). The podcast dashboard writes one master summary per
// week from that week's episode analyses; this rolls a whole calendar month of those same
// inputs (grouped by week) into ONE consolidated summary per month, then asks which themes
// continued, dropped off, or are new.
//
// The AI runs ONCE A MONTH, in the newsletter-edition run (the only run given the key): it
// covers the last two complete months (on 2 Nov: October vs September) and reuses any month
// already summarised after it ended, so a normal edition costs one month + one comparison.
// Every other run is data-only: it grows clients/<client>/data/podcast-archive.json (every
// episode seen in the last 3 months, so a month stays whole after the feed's "latest few
// episodes per show" window moves on) and leaves the AI edition untouched.
// Honest fallback before any edition exists or on a model error: months are built from the
// episode analyses as published and topics are matched by exact name — nothing is invented.
//
// MONTH TO DATE. Every run also writes `currentMonth` (the month after the edition's
// latest: normally the running calendar month) and `compareMtd` (edition month -> it), so
// the dashboard always has a current-month tile. Its counts, shows, tone, weeks, lead
// points and most-named subjects are rebuilt from the archive on every run, with no AI.
// Its AI summary is bounded: written only when the workflow opts in (below), the month
// has MTD_MIN_ANALYSED analysed episodes, new episodes landed, and the summary on file is
// at least MTD_EVERY_DAYS old — or a day old with the month's episodes doubled since, so an
// early read isn't kept all week (one attempt a day after a failure). Between rewrites
// the summary on file is kept, under the fresh counts. The edition is never touched by it.
//
// Which AI work a run may do: with PODCAST_EDITION set, the workflow gives the key on every
// run — the edition is written only when it is true (refresh.yml's edition gate `due`) and
// the month-to-date summary whenever it is due. Without PODCAST_EDITION a key means an
// edition run and nothing else, exactly as before.
//
// Usage: CLIENT=tybourne node scripts/podcast-monthly.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson } from './lib/http.mjs';
import { monthOf } from './lib/quarters.mjs';
import {
  converse,
  bedrockConfigured,
  bedrockRegion,
  parseJson,
  usageLine,
} from './lib/bedrock.mjs';
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
  topTopics,
  freshenMonth,
} from './lib/podcastMonthly.mjs';
import { SHOW_LABEL } from './connectors/podcast.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIENT = process.env.CLIENT || 'tybourne';
const configPath = resolve(ROOT, `clients/${CLIENT}/client.config.json`);
const outPath = resolve(ROOT, `clients/${CLIENT}/data/podcast-monthly.json`);
const archivePath = resolve(ROOT, `clients/${CLIENT}/data/podcast-archive.json`);
const KEEP_MONTHS = 3;
const MTD_EVERY_DAYS = 7; // the month-to-date AI summary is rewritten at most weekly
const MTD_MIN_ANALYSED = 6; // …and only once enough of the month is analysed to say something
const MTD_RETRY_HOURS = 24; // after a failed attempt, wait a day before paying again
const truthy = (v) => /^(1|true|yes)$/i.test(String(v ?? '').trim());

const MONTH_SYSTEM =
  "You are the editor of Munshot's monthly investor-podcast brief for Tybourne Global Holdings, a global investment firm. " +
  "DATA holds every investor-podcast episode published in one calendar month, grouped by week — the same per-episode analyses the podcast dashboard's weekly summaries are written from. " +
  'Episodes with "summarised": true carry the full analysis (key points, synthesis, what changed, why it matters, numbers). ' +
  'The rest carry only the title and show notes: use them to see what was covered, but lean on the summarised episodes for substance. ' +
  'Write ONE consolidated summary of the whole month. Themes are threads that cut across episodes and shows, named in plain words (3-7 words) — never an episode title; ' +
  'order them by how much airtime they got and give 4-8 (fewer if the month is thin). ' +
  'Use ONLY facts in DATA: never invent numbers, names, quotes or causes, and copy every figure in "numbers" verbatim from DATA. ' +
  'Plain, sharp, investor-ready English, no hype. Return ONLY the JSON object.';

const MTD_SYSTEM =
  `${MONTH_SYSTEM} This month is still running: DATA covers it to date only. ` +
  'Summarise what the shows have said so far and never guess at the rest of the month; "watch" is what to watch for the rest of this month.';

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

// `compact` drops the JSON indentation (about a fifth of the tokens) — used for the
// month-to-date call, which runs weekly; the edition's prompt is unchanged.
function ask(DATA, schema, strict = false, compact = false) {
  return (
    (strict ? 'Your previous reply was not valid JSON. Return ONLY the JSON object — no markdown fences, no commentary.\n\n' : '') +
    `DATA:\n\`\`\`json\n${JSON.stringify(DATA, null, compact ? 0 : 2)}\n\`\`\`\n\n` +
    `Return ONLY this JSON shape (no markdown, no prose):\n${schema}`
  );
}

/** One model call, validated by `apply`; re-asks once on malformed/invalid JSON. */
async function aiJson({ system, data, schema, maxTokens, label, apply, compact = false }) {
  let res = await converse({ system, user: ask(data, schema, false, compact), maxTokens, timeout: 180, label });
  console.log(`  ${label}: ${res.modelId} — ${usageLine(res.usage)}`);
  let out = apply(parseJson(res.text));
  if (!out) {
    console.log(`  ${label}: first reply unusable — re-asking once.`);
    res = await converse({ system, user: ask(data, schema, true, compact), maxTokens, timeout: 180, label: `${label}-retry` });
    console.log(`  ${label}-retry: ${res.modelId} — ${usageLine(res.usage)}`);
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
  const useAI = bedrockConfigured();
  // PODCAST_EDITION set (to anything, even empty) = the workflow gives the key on every run
  // and gates the edition itself; only then is the month-to-date summary written, so a
  // workflow that hands over the key on edition runs alone keeps behaving exactly as before.
  const gated = process.env.PODCAST_EDITION !== undefined;
  const editionAI = useAI && (gated ? truthy(process.env.PODCAST_EDITION) : true);
  const mtdAI = useAI && gated;
  const recsOf = (ym) => archive.filter((r) => monthOf(r.date) === ym);
  const now = new Date();
  const errors = [];

  // ---- The edition: the last two complete months + their comparison (once a month). ----
  async function buildEdition() {
    // The edition covers the last two complete months.
    const thisId = addMonths(monthOf(now.toISOString()), -1);
    const lastId = addMonths(thisId, -1);

    async function buildMonth(ym) {
      const recs = recsOf(ym);
      const meta = monthMeta(ym, recs);
      if (!recs.length) return { ...fallbackMonth(meta, recs), inputHash: null };
      const pack = monthPack(meta, recs);
      const inputHash = hashOf(pack);
      // Reuse an AI summary when its inputs are unchanged, or when it was written after the
      // month ended (it already covers the whole month — no need to pay for it twice).
      const cached = [prev?.thisMonth, prev?.lastMonth].find((m) => m?.id === ym && m.ai);
      if (cached && (cached.inputHash === inputHash || String(cached.aiAt) >= `${addMonths(ym, 1)}-01`)) {
        console.log(`  ${meta.label}: keeping the AI summary written ${String(cached.aiAt).slice(0, 10)} (${cached.model}).`);
        return { ...cached, mtd: meta.mtd };
      }
      if (!editionAI) return { ...fallbackMonth(meta, recs), inputHash };
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
        return { ...out, model, aiAt: new Date().toISOString(), inputHash };
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
        } else if (editionAI) {
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

    const status = !editionAI ? 'no-key' : errors.length ? 'error' : 'ok';
    const note =
      status === 'no-key'
        ? 'No AI edition yet — month summaries are written once a month with the newsletter edition (needs the Bedrock key). Showing the episode analyses as published.'
        : status === 'error'
          ? `Some AI steps failed — those parts show the episode analyses as published. ${errors.join(' | ')}`
          : undefined;

    return {
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
    };
  }

  // Not an edition run and an AI edition is on file: keep it exactly as it is.
  let edition;
  const editionBuilt = !(!editionAI && (prev?.thisMonth?.ai || prev?.lastMonth?.ai));
  if (!editionBuilt) {
    const { currentMonth: _c, compareMtd: _m, mtdAttempt: _a, mtdAt: _t, ...kept } = prev;
    edition = kept;
    console.log(`Podcast monthly: no edition this run — keeping the ${prev.lastMonth.label} / ${prev.thisMonth.label} AI edition.`);
  } else {
    edition = await buildEdition();
  }

  // ---- Month to date: the month after the edition's latest (normally this month). ----
  // Right after a month ends and before its edition lands (the 1st, or longer if the
  // edition is late), that is the month that just ended — still shown, never skipped.
  const mtdErrors = [];
  let mtdAttempt = prev?.mtdAttempt ?? null;
  let mtdWritten = false;
  const hoursSince = (iso) => (iso ? (now.getTime() - Date.parse(iso)) / 36e5 : Infinity);

  async function buildCurrent(ym) {
    const recs = recsOf(ym);
    const meta = { ...monthMeta(ym, recs, now), topics: topTopics(recs) };
    if (!recs.length) return { ...fallbackMonth(meta, recs), inputHash: null };
    const pack = monthPack(meta, recs);
    const inputHash = hashOf(pack);
    const cached = prev?.currentMonth?.id === ym && prev.currentMonth.ai ? prev.currentMonth : null;
    const failedLately = mtdAttempt?.month === ym && !mtdAttempt.ok && hoursSince(mtdAttempt.at) < MTD_RETRY_HOURS;
    // Weekly — or sooner (at most daily) while the month is young and has doubled since
    // the last summary, so a read written from the first few episodes isn't kept all week.
    const stale =
      cached &&
      cached.inputHash !== inputHash &&
      (hoursSince(cached.aiAt) >= MTD_EVERY_DAYS * 24 ||
        (hoursSince(cached.aiAt) >= 24 && meta.episodes >= 2 * (cached.aiEpisodes ?? Infinity)));
    const due = mtdAI && meta.mtd && meta.summarised >= MTD_MIN_ANALYSED && !failedLately && (!cached || stale);
    if (due) {
      try {
        const { out, model } = await aiJson({
          system: MTD_SYSTEM,
          data: pack,
          schema: MONTH_SCHEMA,
          maxTokens: 6000,
          label: `podcast-mtd ${ym}`,
          apply: (o) => applyMonthAI(meta, pack, o),
          compact: true,
        });
        console.log(`  ${meta.label} (MTD): AI summary written via ${model} (${out.themes.length} themes, ${meta.episodes} episodes).`);
        mtdAttempt = { month: ym, at: now.toISOString(), ok: true };
        mtdWritten = true;
        return { ...out, model, aiAt: now.toISOString(), inputHash, aiEpisodes: meta.episodes, aiSummarised: meta.summarised };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        mtdErrors.push(msg);
        mtdAttempt = { month: ym, at: now.toISOString(), ok: false, error: msg.slice(0, 300) };
      }
    }
    if (cached) return freshenMonth(cached, meta);
    return { ...fallbackMonth(meta, recs), inputHash };
  }

  const nextId = addMonths(edition.thisMonth.id, 1);
  const curId = monthOf(now.toISOString());
  const currentMonth = nextId <= curId ? await buildCurrent(nextId) : null;

  let compareMtd = null;
  const base = edition.thisMonth;
  if (currentMonth?.episodes && base.episodes) {
    if (base.ai && currentMonth.ai) {
      const cpack = comparePack(base, currentMonth);
      const inputHash = hashOf(cpack);
      if (prev?.compareMtd?.ai && prev.compareMtd.inputHash === inputHash) {
        compareMtd = prev.compareMtd;
      } else if (mtdAI) {
        try {
          const { out, model } = await aiJson({
            system: COMPARE_SYSTEM,
            data: cpack,
            schema: COMPARE_SCHEMA,
            maxTokens: 2500,
            label: 'podcast-compare-mtd',
            apply: (o) => applyCompareAI(base, currentMonth, o),
          });
          compareMtd = { ...out, model, inputHash };
        } catch (e) {
          mtdErrors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
    if (!compareMtd) compareMtd = topicCompare(recsOf(base.id), recsOf(currentMonth.id), 2);
  }

  const out = { ...edition, currentMonth, compareMtd, mtdAttempt: mtdAttempt ?? undefined };
  // Only rewrite the file when something besides the timestamp changed (no churn commits).
  const same = prev && JSON.stringify({ ...out, mtdAt: prev.mtdAt }) === JSON.stringify(prev);
  if (!same) await writeJson(outPath, { ...out, mtdAt: now.toISOString() });
  await writeJson(archivePath, { source: system.source.episodes, keepMonths: KEEP_MONTHS, episodes: archive });

  const line = (m) => `${m.label}: ${m.episodes} episodes (${m.summarised} analysed), ${m.themes.length} themes, ${m.ai ? 'AI' : 'no AI'}`;
  console.log(
    `Podcast monthly [${edition.status}] — ${line(edition.lastMonth)} → ${line(edition.thisMonth)}; compare: ${edition.compare ? edition.compare.basis : 'none'}.`
  );
  if (currentMonth) {
    const ai = currentMonth.ai
      ? `AI summary ${mtdWritten ? 'written this run' : `of ${String(currentMonth.aiAt).slice(0, 10)}`} (${currentMonth.aiEpisodes} episodes)`
      : 'no AI summary yet';
    console.log(
      `  ${currentMonth.label}${currentMonth.mtd ? ' (MTD)' : ''}: ${currentMonth.episodes} episodes (${currentMonth.summarised} analysed), ${ai}; ` +
        `vs ${base.label}: ${compareMtd ? compareMtd.basis : 'none'}${same ? ' — unchanged, file not rewritten' : ''}.`
    );
  }
  if (edition.note && editionBuilt) console.log(`  ${edition.note}`);
  if (mtdErrors.length) console.log(`  Month-to-date AI failed (next try after ${MTD_RETRY_HOURS}h): ${mtdErrors.join(' | ')}`);
  if (edition.status === 'error' && errors.length) process.exitCode = 1;
  if (mtdErrors.length) process.exitCode = 1;
}

run().catch((e) => {
  console.error('podcast-monthly failed:', e);
  process.exitCode = 1;
});
