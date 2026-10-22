// Podcast monthly summaries — the pure helpers behind scripts/podcast-monthly.mjs.
//
// The podcast dashboard's weekly master summary is an LLM read of that week's
// per-episode analyses. A month is built from the same inputs: every episode in the
// calendar month, grouped by week. These helpers compact feed episodes into an
// archive record, merge them into a rolling archive (the feed only keeps each show's
// latest few episodes, so a month would otherwise lose its early weeks), build the
// pack sent to the model, the honest no-AI fallback, and validate the model's JSON.
import { createHash } from 'node:crypto';
import { monthOf, monthLabel } from './quarters.mjs';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const hashOf = (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);

const isStr = (s) => typeof s === 'string' && s.trim().length > 0;
const norm = (s) => String(s).trim().toLowerCase();

/** Clean + clip text to n chars on a word boundary (drops markdown bold and links). */
export function clip(s, n) {
  const t = String(s ?? '')
    .replace(/\*\*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= n) return t;
  const i = t.lastIndexOf(' ', n);
  return `${t.slice(0, i > n * 0.6 ? i : n).trim()}…`;
}

/** "2026-10" + n months -> "2026-11" (wraps years). */
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2026-10" -> "October 2026" */
export function monthLong(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** One feed episode -> the compact record we archive and send to the model. */
export function compactEpisode(e, showLabel) {
  const s = e.summary && typeof e.summary === 'object' ? e.summary : null;
  const names = (arr) => (Array.isArray(arr) ? arr.map((x) => x?.name).filter(isStr) : []);
  const rec = {
    id: String(e.id),
    podcastId: e.podcastId || 'other',
    show: showLabel(e.podcastId),
    title: clip(e.title, 200),
    date: e.publishedAt,
    url: e.sourceUrl || undefined,
    summarised: !!s,
  };
  if (s) {
    const hs = Array.isArray(s.highlights) ? s.highlights.filter((h) => h && isStr(h.title)) : [];
    const key = hs.filter((h) => h.key);
    rec.tone = s.tone?.overall || undefined;
    rec.keyPoints = (key.length ? key : hs).slice(0, 4).map((h) => ({ title: clip(h.title, 160), detail: clip(h.detail, 320) }));
    rec.synthesis = clip(Array.isArray(s.synthesis) ? s.synthesis[0] : s.synthesis, 900) || undefined;
    rec.whatChanged = clip(s.insight?.whatChanged, 320) || undefined;
    rec.whyItMatters = clip(s.insight?.whyItMatters, 320) || undefined;
    rec.beneficiaries = names(s.insight?.beneficiaries).slice(0, 5);
    rec.atRisk = names(s.insight?.atRisk).slice(0, 5);
    rec.numbers = (Array.isArray(s.quantData) ? s.quantData : [])
      .filter((q) => q && isStr(q.metric) && isStr(q.value))
      .slice(0, 5)
      .map((q) => ({ metric: clip(q.metric, 120), value: clip(q.value, 60), context: clip(q.context, 160) || undefined }));
    rec.topics = (Array.isArray(s.tone?.aspects) ? s.tone.aspects : []).map((a) => a?.subject).filter(isStr).slice(0, 6);
  } else {
    rec.notes = clip(e.notes || e.blurb, 420) || undefined;
  }
  return JSON.parse(JSON.stringify(rec)); // drop undefined keys
}

/** Merge live feed records into the archive by id and keep the last `keepMonths`
 *  calendar months. A summarised record is never replaced by an un-summarised copy. */
export function mergeArchive(archive, records, keepMonths = 3) {
  const byId = new Map();
  for (const r of archive) byId.set(r.id, r);
  for (const r of records) {
    const prev = byId.get(r.id);
    if (prev?.summarised && !r.summarised) continue;
    byId.set(r.id, r);
  }
  const all = [...byId.values()].filter((r) => r.date && !Number.isNaN(Date.parse(r.date)));
  if (!all.length) return [];
  const latest = all.map((r) => monthOf(r.date)).sort().slice(-1)[0];
  const first = addMonths(latest, -(keepMonths - 1));
  return all.filter((r) => monthOf(r.date) >= first).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

const dayOf = (iso) => new Date(iso).getUTCDate();

/** Monday-start weeks clipped to the month, oldest first: "1–4 Oct", "5–11 Oct", … */
export function weeksOf(ym, recs) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mon = MONTHS_SHORT[m - 1];
  const weeks = new Map();
  for (const r of recs) {
    const d = dayOf(r.date);
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon=0
    const start = Math.max(1, d - dow);
    const end = Math.min(lastDay, d - dow + 6);
    const id = `${ym}-${String(start).padStart(2, '0')}`;
    if (!weeks.has(id)) weeks.set(id, { id, label: start === end ? `${start} ${mon}` : `${start}–${end} ${mon}`, recs: [] });
    weeks.get(id).recs.push(r);
  }
  return [...weeks.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((w) => ({ ...w, recs: w.recs.sort((a, b) => String(b.date).localeCompare(String(a.date))) }));
}

const TONE_ORDER = ['positive', 'neutral', 'mixed', 'cautious', 'negative'];

export function toneCounts(recs) {
  const c = {};
  for (const r of recs) if (r.tone) c[r.tone] = (c[r.tone] || 0) + 1;
  return c;
}

export function toneStr(counts) {
  const s = Object.entries(counts).sort((a, b) => b[1] - a[1] || TONE_ORDER.indexOf(a[0]) - TONE_ORDER.indexOf(b[0]));
  return s.length ? s.map(([k, v]) => `${v} ${k}`).join(', ') : null;
}

/** The one-line read of an episode shown in the week-by-week list. */
function episodeLine(r) {
  return r.whatChanged || r.keyPoints?.[0]?.title || (r.notes ? clip(r.notes, 200) : undefined);
}

/** The month's facts (counts, shows, tone, weeks) — everything that isn't written by the model. */
export function monthMeta(ym, recs, now = new Date()) {
  const showCount = {};
  for (const r of recs) showCount[r.show] = (showCount[r.show] || 0) + 1;
  const weeks = weeksOf(ym, recs);
  return {
    id: ym,
    label: monthLabel(ym),
    longLabel: monthLong(ym),
    mtd: ym === monthOf(now.toISOString()),
    episodes: recs.length,
    summarised: recs.filter((r) => r.summarised).length,
    shows: Object.keys(showCount).sort((a, b) => showCount[b] - showCount[a] || a.localeCompare(b)),
    toneCounts: toneCounts(recs),
    weeks: weeks.map((w) => ({
      id: w.id,
      label: w.label,
      line: null,
      episodes: w.recs.map((r) =>
        JSON.parse(
          JSON.stringify({
            id: r.id,
            show: r.show,
            title: r.title,
            date: r.date,
            url: r.url,
            summarised: r.summarised,
            tone: r.tone,
            line: episodeLine(r),
          })
        )
      ),
    })),
  };
}

/** What the model sees for one month: every episode, grouped by week. */
export function monthPack(meta, recs) {
  const byId = new Map(recs.map((r) => [r.id, r]));
  return {
    month: `${meta.longLabel}${meta.mtd ? ' (month to date)' : ''}`,
    episodes: meta.episodes,
    summarised: meta.summarised,
    shows: meta.shows,
    weeks: meta.weeks.map((w) => ({
      id: w.id,
      label: w.label,
      episodes: w.episodes.map((e) => {
        const { podcastId, url, ...rest } = byId.get(e.id); // ids/links are for the UI only
        return { ...rest, date: String(rest.date).slice(0, 10) };
      }),
    })),
  };
}

/** Honest no-AI month: each episode's lead point as a theme, the episodes' own numbers. */
export function fallbackMonth(meta, recs) {
  const themes = [];
  const seen = new Set();
  for (const r of recs) {
    const kp = r.keyPoints?.[0];
    if (!kp || seen.has(norm(kp.title))) continue;
    seen.add(norm(kp.title));
    themes.push({ title: kp.title, summary: kp.detail || undefined, shows: [r.show], episodeIds: [r.id] });
    if (themes.length >= 8) break;
  }
  const numbers = [];
  for (const r of recs) {
    for (const n of r.numbers ?? []) {
      numbers.push({ value: n.value, metric: n.metric, context: [n.context, r.show].filter(Boolean).join(' · ') });
      if (numbers.length >= 6) break;
    }
    if (numbers.length >= 6) break;
  }
  return {
    ...meta,
    ai: false,
    headline: null,
    overview: [],
    themes,
    numbers,
    tone: toneStr(meta.toneCounts),
    watch: [],
  };
}

const strList = (a, cap) => (Array.isArray(a) ? a.filter(isStr).map((s) => s.trim()).slice(0, cap) : []);

/** Validate the model's month JSON against the pack. null => unusable (caller falls back).
 *  Shows/episode ids must exist in the month; every number must appear verbatim in the pack. */
export function applyMonthAI(meta, pack, o) {
  if (!o || !isStr(o.headline) || !Array.isArray(o.overview) || !Array.isArray(o.themes)) return null;
  const overview = strList(o.overview, 5);
  const showSet = new Set(meta.shows);
  const idSet = new Set(meta.weeks.flatMap((w) => w.episodes.map((e) => e.id)));
  const seen = new Set();
  const themes = [];
  for (const t of o.themes) {
    if (!t || !isStr(t.title) || seen.has(norm(t.title))) continue;
    seen.add(norm(t.title));
    themes.push({
      title: clip(t.title, 90),
      summary: isStr(t.summary) ? t.summary.trim() : undefined,
      shows: strList(t.shows, 12).filter((s) => showSet.has(s)),
      episodeIds: strList(t.episodeIds, 40).filter((id) => idSet.has(id)),
      strength: t.strength === 'major' || t.strength === 'minor' ? t.strength : undefined,
    });
    if (themes.length >= 8) break;
  }
  if (!overview.length || !themes.length) return null;

  const haystack = JSON.stringify(pack);
  const numbers = (Array.isArray(o.numbers) ? o.numbers : [])
    .filter((n) => n && isStr(n.value) && isStr(n.metric) && haystack.includes(n.value.trim()))
    .slice(0, 6)
    .map((n) => ({ value: n.value.trim(), metric: n.metric.trim(), context: isStr(n.context) ? n.context.trim() : undefined }));

  const weekLine = new Map(
    (Array.isArray(o.weeks) ? o.weeks : []).filter((w) => w && isStr(w.id) && isStr(w.line)).map((w) => [w.id, w.line.trim()])
  );
  return JSON.parse(
    JSON.stringify({
      ...meta,
      weeks: meta.weeks.map((w) => ({ ...w, line: weekLine.get(w.id) ?? null })),
      ai: true,
      headline: o.headline.trim(),
      overview,
      themes,
      numbers,
      tone: isStr(o.tone) ? o.tone.trim() : toneStr(meta.toneCounts),
      watch: strList(o.watch, 5),
    })
  );
}

/** What the comparison model sees: both months' themes (title + summary). */
export function comparePack(last, cur) {
  const side = (m) => ({ month: m.longLabel, themes: m.themes.map((t) => ({ title: t.title, summary: t.summary })) });
  return { last: side(last), this: side(cur) };
}

/** Validate the model's comparison. Titles must match a theme exactly (case-insensitive);
 *  any theme the model left out is placed honestly (last -> dropped, this -> new). */
export function applyCompareAI(last, cur, o) {
  if (!o || !Array.isArray(o.continued)) return null;
  const lastBy = new Map(last.themes.map((t) => [norm(t.title), t.title]));
  const curBy = new Map(cur.themes.map((t) => [norm(t.title), t.title]));
  const usedLast = new Set();
  const usedCur = new Set();
  const continued = [];
  for (const c of o.continued) {
    if (!c || !isStr(c.last) || !isStr(c.this)) continue;
    const l = norm(c.last);
    const t = norm(c.this);
    if (!lastBy.has(l) || !curBy.has(t) || usedLast.has(l) || usedCur.has(t)) continue;
    usedLast.add(l);
    usedCur.add(t);
    continued.push({ last: lastBy.get(l), this: curBy.get(t), note: isStr(c.note) ? c.note.trim() : undefined });
  }
  const notes = (arr) =>
    new Map((Array.isArray(arr) ? arr : []).filter((x) => x && isStr(x.theme) && isStr(x.note)).map((x) => [norm(x.theme), x.note.trim()]));
  const dropNotes = notes(o.dropped);
  const newNotes = notes(o.new);
  return JSON.parse(
    JSON.stringify({
      basis: 'themes',
      ai: true,
      read: isStr(o.read) ? o.read.trim() : null,
      continued,
      dropped: [...lastBy].filter(([k]) => !usedLast.has(k)).map(([k, title]) => ({ theme: title, note: dropNotes.get(k) })),
      new: [...curBy].filter(([k]) => !usedCur.has(k)).map(([k, title]) => ({ theme: title, note: newNotes.get(k) })),
    })
  );
}

/** Honest no-AI comparison: the companies/subjects the episode analyses name, matched
 *  exactly across the two months (ordered by how many episodes named them). */
export function topicCompare(lastRecs, curRecs) {
  const key = (s) =>
    norm(s)
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const topics = (recs) => {
    const m = new Map();
    for (const r of recs) {
      const names = new Set([...(r.topics ?? []), ...(r.beneficiaries ?? []), ...(r.atRisk ?? [])].map((n) => n.trim()));
      const keys = new Set();
      for (const n of names) {
        const k = key(n);
        if (!k || keys.has(k)) continue;
        keys.add(k);
        const cur = m.get(k) ?? { name: n.replace(/\s*\([^)]*\)\s*/g, ' ').trim(), count: 0 };
        cur.count += 1;
        m.set(k, cur);
      }
    }
    return m;
  };
  const L = topics(lastRecs);
  const C = topics(curRecs);
  const byCount = (m) => (a, b) => m.get(b).count - m.get(a).count || a.localeCompare(b);
  const lastKeys = [...L.keys()];
  const curKeys = [...C.keys()];
  return {
    basis: 'topics',
    ai: false,
    read: null,
    continued: curKeys
      .filter((k) => L.has(k))
      .sort(byCount(C))
      .map((k) => ({ last: L.get(k).name, this: C.get(k).name })),
    dropped: lastKeys
      .filter((k) => !C.has(k))
      .sort(byCount(L))
      .map((k) => ({ theme: L.get(k).name })),
    new: curKeys
      .filter((k) => !L.has(k))
      .sort(byCount(C))
      .map((k) => ({ theme: C.get(k).name })),
  };
}
