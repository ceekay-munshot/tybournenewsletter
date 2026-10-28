// Emphasis engine for newsletter prose — the house style of a sell-side research note,
// applied by rule to whatever the editor wrote (AI edition or the factual fallback):
//
//   signed moves   +4.6%  -2.7pp  +0.38pts   -> bold, green up / red down
//   levels         $3.50/hr  567.4T  15.49%  -> bold ink
//   tracked names  B200  DeepSeek  TSM       -> medium ink (vocabulary = the dashboards' own rows)
//   period stamps  (Sep-26 → Oct-26 MTD)     -> muted, so the numbers carry the line
//   biggest % move in a passage              -> marker highlight
//   risk language  worth watching, outlier   -> amber marker
//
// It never changes a character of the text — only how it is set.
import type { ChangeBlock } from '../types';

export type Tone = 'up' | 'down' | 'flat' | 'figure' | 'entity' | 'period' | 'flag';

export interface Span {
  text: string;
  tone?: Tone;
  /** The passage's headline move — gets the marker highlight. */
  key?: boolean;
}

export interface Lexicon {
  re: RegExp;
}

const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
/** A bracketed window like (Sep-26 → Oct-26 MTD) — but not one that carries figures. */
const PERIOD = String.raw`\([^()%$+]*→[^()%$+]*\)`;
const SIGNED = String.raw`[+\-−–]${NUM}(?:ppt|pp|pts|pt|bps|bp|%|x)?`;
const FIGURE = [
  String.raw`[$€£]${NUM}(?:\s?(?:bn|mn|tn|[KMBT]))?(?:\/[a-z]+)?`,
  String.raw`${NUM}(?:%|ppt|pp|pts|bps|x|[KMBT])`,
  String.raw`\d+(?:\.\d+)?\/\d+(?:\.\d+)?`,
  String.raw`\d{1,3}(?:,\d{3})+`,
].join('|');
const FLAG = [
  String.raw`[Ww]orth (?:watching|monitoring)`,
  String.raw`[Ww]arrants? (?:monitoring|attention|watching)`,
  String.raw`[Dd]eteriorat(?:ing|ed|es|ion)`,
  String.raw`[Bb]ase-sensitive`,
  String.raw`[Oo]utliers?`,
  String.raw`against (?:peers|the chain)`,
].join('|');

/** Row labels that are buckets, not names — never emphasised. */
const STOP = new Set(['other', 'others', 'other / mixed', 'other open models', 'unresolved', 'unresolved family', 'total', 'all', 'sources', 'none', 'misc', 'unclassified', 'n/a']);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex for one tracked name. "Semi Equip / Consumables" also matches "Semi Equip/Consumables";
 *  multi-word names also match with a lower-case first letter ("Chat & assistants" mid-sentence). */
function namePattern(name: string): string {
  const body = name
    .split(/\s*\/\s*/)
    .map((part) => part.split(/\s+/).map(escape).join(String.raw`\s+`))
    .join(String.raw`\s*\/\s*`);
  const first = name[0];
  return /\s/.test(name) && first.toLowerCase() !== first.toUpperCase()
    ? `[${first.toUpperCase()}${first.toLowerCase()}]${body.slice(escape(first).length)}`
    : body;
}

/** The vocabulary of names this edition tracks: dashboard names, breakdown rows (and their
 *  sub-rows) and the first column of each supporting table. */
export function buildLexicon(systems: ChangeBlock[]): Lexicon {
  const names = new Set<string>();
  const add = (raw: string | undefined) => {
    const s = raw?.trim();
    if (s && s.length >= 2 && s.length <= 40 && /[A-Za-z]/.test(s) && !STOP.has(s.toLowerCase())) names.add(s);
  };
  for (const b of systems) {
    add(b.name);
    for (const r of b.breakdown ?? []) {
      add(r.label);
      for (const s of r.sub ?? []) add(s.label);
    }
    const tables = [...(b.auxTables ?? []), ...(b.auxTableGroups ?? []).flatMap((g) => g.tables)];
    for (const t of tables) for (const row of t.rows) add(row[0]?.text);
  }
  const entity = [...names].sort((a, b) => b.length - a.length).map(namePattern).join('|');
  // One pass, first alternative wins: periods swallow their own numbers, then moves, levels,
  // risk words, names. The leading group stands in for a lookbehind (older Safari lacks it).
  const alts = [PERIOD, SIGNED, FIGURE, FLAG, entity].filter(Boolean).map((p) => `(${p})`);
  return { re: new RegExp(String.raw`(^|[^\w])(?:${alts.join('|')})(?!\w)`, 'g') };
}

const TONE_BY_GROUP: Tone[] = ['period', 'up', 'figure', 'flag', 'entity'];

function signedTone(token: string): Tone {
  const mag = parseFloat(token.slice(1).replace(/,/g, ''));
  if (!mag) return 'flat';
  return token[0] === '+' ? 'up' : 'down';
}

/** Split a passage into styled spans. */
export function emphasize(text: string, lexicon: Lexicon): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const m of text.matchAll(lexicon.re)) {
    const start = m.index! + m[1].length;
    const group = m.slice(2).findIndex((g) => g !== undefined);
    if (group < 0) continue;
    const token = m[group + 2];
    if (start > at) out.push({ text: text.slice(at, start) });
    const tone = TONE_BY_GROUP[group] === 'up' ? signedTone(token) : TONE_BY_GROUP[group];
    out.push({ text: token, tone });
    at = start + token.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });

  // Marker on the biggest percentage move — only when there is more than one move to rank.
  const moves = out.filter((s) => (s.tone === 'up' || s.tone === 'down') && s.text.endsWith('%'));
  if (moves.length > 1) {
    const size = (s: Span) => Math.abs(parseFloat(s.text.slice(1).replace(/,/g, '')));
    moves.reduce((best, s) => (size(s) > size(best) ? s : best)).key = true;
  }
  return out;
}
