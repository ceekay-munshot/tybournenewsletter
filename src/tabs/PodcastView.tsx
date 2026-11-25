import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Repeat,
  ArrowDownRight,
  Sparkles,
  X,
  Layers,
  CalendarDays,
  Hash,
  Eye,
  Info,
  ExternalLink,
  GitCompareArrows,
  BookOpenText,
  Quote,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ChangeBlock, PodcastMonthly, PodcastMonth, PodcastCompare, PodcastTheme, PodcastWeek } from '../types';
import { Card, CardHeader, Badge } from '../components/ui/Card';
import { Segmented } from '../components/ui/Controls';
import { QuarterThemes } from '../components/QuarterThemes';
import { SourceLine } from './SystemView';
import { iconFor } from '../lib/icons';
import { sectorColor, withAlpha } from '../lib/brand';
import { dateLabel } from '../lib/format';

type Mode = 'month' | 'quarter';
/** last/this = the monthly edition's two complete months; current = the month after
 *  (normally month to date), rebuilt on every refresh. */
type Side = 'last' | 'this' | 'current';
/** Which comparison is on screen: edition month -> current month, or the edition's own. */
type Pair = 'mtd' | 'edition';
type ThemeStatus = 'continued' | 'dropped' | 'new';

const LAST_TINT = '#64748B';
const norm = (s: string) => s.trim().toLowerCase();
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const monthTag = (m: PodcastMonth) => `${m.label}${m.mtd ? ' (MTD)' : ''}`;
const shortMonth = (m: PodcastMonth) => m.longLabel.split(' ')[0].slice(0, 3);
const dayMonth = (iso: string) => dateLabel(iso).replace(/ \d{4}$/, '');
/** Newest episode date in a month ("to 25 Nov"). */
const latestDate = (m: PodcastMonth) =>
  m.weeks
    .flatMap((w) => w.episodes.map((e) => e.date))
    .sort()
    .slice(-1)[0];

// Pressable tiles: transform-only, custom ease-out, hover lift only on real pointers.
const EASE = 'ease-[cubic-bezier(0.23,1,0.32,1)]';
const HOVER = '[@media(hover:hover)_and_(pointer:fine)]';
const TILE_MOTION = `transition-transform duration-200 ${EASE} enabled:active:scale-[0.985] ${HOVER}:enabled:hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none`;
const ICON_MOTION = `transition-transform duration-200 ${EASE} ${HOVER}:group-enabled:group-hover:scale-105 motion-reduce:transition-none`;
const ARROW_MOTION = `transition-transform duration-200 ${EASE} ${HOVER}:group-enabled:group-hover:translate-x-0.5 motion-reduce:transition-none`;

const monthOfSide = (m: PodcastMonthly, s: Side): PodcastMonth | null =>
  s === 'last' ? m.lastMonth : s === 'this' ? m.thisMonth : (m.currentMonth ?? null);

function pairDef(m: PodcastMonthly, p: Pair): { from: Side; to: Side; compare: PodcastCompare | null } {
  return p === 'mtd' && m.currentMonth
    ? { from: 'this', to: 'current', compare: m.compareMtd ?? null }
    : { from: 'last', to: 'this', compare: m.compare };
}

const STATUS: Record<ThemeStatus, { label: string; color: string; icon: LucideIcon }> = {
  continued: { label: 'continued', color: '#6366F1', icon: Repeat },
  dropped: { label: 'dropped', color: '#F43F5E', icon: ArrowDownRight },
  new: { label: 'new', color: '#10B981', icon: Sparkles },
};

const TONE_ORDER = ['positive', 'neutral', 'mixed', 'cautious', 'negative'];
const TONE_COLOR: Record<string, string> = {
  positive: '#10B981',
  neutral: '#94A3B8',
  mixed: '#F59E0B',
  cautious: '#F97316',
  negative: '#F43F5E',
};
const toneColor = (t: string) => TONE_COLOR[t] ?? '#CBD5E1';

/** Each side's theme status + its counterpart title in the other month — only for an AI
 *  theme match (a topic match names companies/subjects, not these theme titles). */
function themeLinks(c: PodcastCompare | null) {
  const last = new Map<string, ThemeStatus>();
  const cur = new Map<string, ThemeStatus>();
  const lastTo = new Map<string, string>();
  const curFrom = new Map<string, string>();
  if (c?.basis === 'themes') {
    for (const x of c.continued) {
      last.set(norm(x.last), 'continued');
      cur.set(norm(x.this), 'continued');
      lastTo.set(norm(x.last), x.this);
      curFrom.set(norm(x.this), x.last);
    }
    for (const x of c.dropped) last.set(norm(x.theme), 'dropped');
    for (const x of c.new) cur.set(norm(x.theme), 'new');
  }
  return { last, cur, lastTo, curFrom };
}

/** One month's theme statuses + counterparts under the comparison on screen (empty for a
 *  month that isn't part of it). `forward`: this month is the earlier side. */
function sideLinks(m: PodcastMonthly, pair: Pair, side: Side) {
  const d = pairDef(m, pair);
  const links = themeLinks(d.compare);
  if (side === d.from) return { statuses: links.last, counterpart: links.lastTo, other: monthOfSide(m, d.to), forward: true };
  if (side === d.to) return { statuses: links.cur, counterpart: links.curFrom, other: monthOfSide(m, d.from), forward: false };
  return { statuses: new Map<string, ThemeStatus>(), counterpart: new Map<string, string>(), other: null, forward: false };
}

/** Podcast Themes drill-down. Month (default when the monthly summaries exist): the
 *  current month to date on top, the edition's two complete months below — click any for
 *  its full summary — plus which themes continued, dropped off or are new (last full
 *  month -> month to date by default, or the edition's own pair). Quarter: the original
 *  QoQ theme comparison. */
export function PodcastView({ block, monthly }: { block: ChangeBlock; monthly: PodcastMonthly | null }) {
  const [mode, setMode] = useState<Mode>(monthly ? 'month' : 'quarter');
  const [open, setOpen] = useState<Side | null>(null);
  const [pair, setPair] = useState<Pair>(monthly?.currentMonth ? 'mtd' : 'edition');
  const Icon = iconFor(block.systemId, block.sector);
  const accent = sectorColor(block.sector);

  const m = mode === 'month' ? monthly : null;
  const C = m?.currentMonth ?? null;
  // The headline pair: last full month -> month to date when there is one.
  const F = m ? (C ? m.thisMonth : m.lastMonth) : undefined;
  const N = m ? (C ?? m.thisMonth) : undefined;
  const lastLabel = F ? monthTag(F) : block.lastPeriodLabel;
  const thisLabel = N ? monthTag(N) : block.thisPeriodLabel;
  const lastN = F ? F.episodes : block.lastValue;
  const thisN = N ? N.episodes : block.thisValue;

  const sourceBlock =
    m && N
      ? {
          ...block,
          notes:
            `${plural(N.episodes, 'investor-podcast episode')} ${N.mtd ? 'so far in' : 'in'} ${N.longLabel} across ` +
            `${plural(N.shows.length, 'show')} (${N.summarised} fully analysed). ` +
            (m.thisMonth.ai || m.lastMonth.ai
              ? "Month summaries are written once a month, with the newsletter edition, by Claude on Amazon Bedrock from the episode analyses — the same inputs as the podcast dashboard's weekly summaries."
              : m.note ?? 'No AI edition yet — showing the episode analyses as published.') +
            (C
              ? ` The ${C.mtd ? 'month-to-date' : C.longLabel} tile is rebuilt from the episodes on every refresh${C.ai ? '; its AI summary is rewritten at most weekly' : ''}.`
              : ''),
        }
      : block;

  return (
    <div className="animate-fade-in">
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${accent}14`, color: accent }}>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <h2 className="font-display text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{block.name}</h2>
              <Badge color={accent}>{block.sector}</Badge>
              <Badge color="#64748B">{m ? 'MoM' : block.comparison}</Badge>
            </div>
            <p className="mt-2 text-[13px] text-slate-500">
              {m ? 'Month themes' : block.metricLabel}: <span className="font-semibold text-slate-700">{lastLabel}</span>{' '}
              <span className="text-slate-300">→</span> <span className="font-semibold text-slate-700">{thisLabel}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="tnum font-display text-[30px] font-bold leading-none text-slate-900">
              {thisN ?? '—'}
              <span className="ml-1.5 text-[13px] font-semibold text-slate-400">episodes</span>
            </div>
            <div className="tnum mt-1.5 text-[12.5px] text-slate-500">
              {lastLabel}: {lastN ?? '—'} <span className="text-slate-300">→</span>{' '}
              <span className="font-semibold text-slate-700">
                {thisLabel}: {thisN ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {monthly && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'quarter', label: 'Quarter' },
              ]}
            />
            <span className="text-[11.5px] text-slate-400">
              {mode === 'month' ? 'Click a month for its full summary' : 'month / quarter'}
            </span>
          </div>
        )}
      </Card>

      {m ? (
        <MonthCompare monthly={m} accent={accent} pair={pair} onPair={setPair} onOpen={setOpen} />
      ) : (
        <QuarterThemes block={block} accent={accent} />
      )}

      <SourceLine block={sourceBlock} />

      {/* Portalled to <body>: the page's fade-in animation makes its own stacking context,
          which would otherwise trap the overlay under the header and sidebar. */}
      {m &&
        open &&
        createPortal(
          <MonthSummaryModal monthly={m} side={open} pair={pair} accent={accent} onSide={setOpen} onClose={() => setOpen(null)} />,
          document.body
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month view: two clickable month boxes + the continued / dropped / new card.

function MonthCompare({
  monthly,
  accent,
  pair,
  onPair,
  onOpen,
}: {
  monthly: PodcastMonthly;
  accent: string;
  pair: Pair;
  onPair: (p: Pair) => void;
  onOpen: (s: Side) => void;
}) {
  const { lastMonth: L, thisMonth: T } = monthly;
  const C = monthly.currentMonth ?? null;
  const d = pairDef(monthly, pair);
  const st = (s: Side) => sideLinks(monthly, pair, s).statuses;
  const from = monthOfSide(monthly, d.from) ?? T;
  const to = monthOfSide(monthly, d.to) ?? T;
  return (
    <>
      {C && <CurrentBox month={C} tint={accent} statuses={st('current')} onOpen={() => onOpen('current')} />}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <MonthBox month={L} role="Earlier month" tint={LAST_TINT} statuses={st('last')} onOpen={() => onOpen('last')} />
        <MonthBox
          month={T}
          role={C ? 'Last full month' : 'Latest month'}
          tint={C ? LAST_TINT : accent}
          statuses={st('this')}
          onOpen={() => onOpen('this')}
          highlight={!C}
        />
      </div>
      <ContinuityCard
        compare={d.compare}
        last={from}
        cur={to}
        accent={accent}
        pairs={
          C
            ? {
                value: pair,
                onChange: onPair,
                options: [
                  { value: 'mtd', label: `${shortMonth(T)} → ${shortMonth(C)}${C.mtd ? ' (MTD)' : ''}` },
                  { value: 'edition', label: `${shortMonth(L)} → ${shortMonth(T)}` },
                ],
              }
            : undefined
        }
      />
    </>
  );
}

/** The current month — normally month to date — as a wide tile above the edition's two
 *  complete months. Counts, tone, lead points and most-named subjects come from the
 *  episodes on every refresh; the AI headline + themes, when there are any, are as of
 *  their own date (written at most weekly). */
function CurrentBox({
  month,
  tint,
  statuses,
  onOpen,
}: {
  month: PodcastMonth;
  tint: string;
  statuses: Map<string, ThemeStatus>;
  onOpen: () => void;
}) {
  const empty = month.episodes === 0;
  const shown = month.themes.slice(0, 6);
  const through = latestDate(month);
  const topics = month.topics ?? [];
  const aiOf = month.aiEpisodes ?? month.episodes;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={empty}
      aria-label={`Open the ${month.longLabel}${month.mtd ? ' month-to-date' : ''} summary`}
      className={`group mb-4 block w-full min-w-0 rounded-2xl p-4 text-left disabled:cursor-default sm:p-5 ${TILE_MOTION}`}
      style={{
        background: `linear-gradient(140deg, #ffffff 0%, ${withAlpha(tint, 0.07)} 100%)`,
        boxShadow: `inset 0 3px 0 0 ${tint}, 0 0 0 1px rgba(226,232,240,0.7), 0 1px 2px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.06)`,
      }}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tint }}>
            {month.mtd ? 'Current month' : 'Just ended'}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="font-display text-[19px] font-bold leading-tight text-slate-900">{month.longLabel}</span>
            {month.mtd ? (
              <MtdBadge through={through} />
            ) : (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-slate-500 ring-1 ring-slate-200">
                summary due with the edition
              </span>
            )}
          </div>
          <div className="tnum mt-0.5 text-[11.5px] text-slate-500">
            {plural(month.episodes, 'episode')} · {plural(month.shows.length, 'show')} · {month.summarised} analysed
          </div>
        </div>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${ICON_MOTION}`}
          style={{ background: withAlpha(tint, 0.1), color: tint }}
        >
          <CalendarDays size={17} strokeWidth={2.2} />
        </span>
      </div>

      {empty ? (
        <p className="mt-3 text-[12.5px] italic text-slate-400">No episodes captured yet for {month.longLabel}.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="min-w-0">
            <ToneBar counts={month.toneCounts} className="w-full" />
            {month.ai && month.headline ? (
              <p className="mt-3 border-l-2 pl-2.5 text-[13px] font-medium leading-snug text-slate-800" style={{ borderColor: tint }}>
                {month.headline}
              </p>
            ) : (
              topics.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">
                    Most named {month.mtd ? 'so far' : ''}
                  </div>
                  <TopicChips topics={topics} className="mt-1.5" />
                </div>
              )
            )}
          </div>

          <div className="min-w-0 md:border-l md:border-slate-200/70 md:pl-6">
            <div className="flex w-full items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">
              <span>{month.ai ? (month.mtd ? 'Themes so far' : 'Themes') : 'Latest lead points'}</span>
              {month.themes.length > 0 && <span className="tnum">{month.themes.length}</span>}
            </div>
            {shown.length ? (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {shown.map((t) => {
                  const s = statuses.get(norm(t.title));
                  return (
                    <li key={t.title} className="flex gap-2 text-[12.5px] leading-snug text-slate-700">
                      <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint }} />
                      <span className="min-w-0">
                        {t.title}
                        {s && <StatusTag s={s} className="ml-1.5" />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1.5 text-[12px] italic text-slate-400">No themes captured.</p>
            )}
            <p className="tnum mt-2 text-[11px] leading-snug text-slate-400">
              {month.ai
                ? `AI summary of ${month.aiAt ? dayMonth(month.aiAt) : '—'}${aiOf < month.episodes ? `, from ${aiOf} of ${month.episodes} episodes` : ''} · counts update every refresh`
                : 'No AI summary for the month yet — each newest episode’s own lead point · updates every refresh'}
            </p>
          </div>
        </div>
      )}

      {!empty && (
        <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: tint }}>
          {month.mtd ? 'Read the month so far' : 'Read the full month'}
          <ArrowRight size={14} strokeWidth={2.4} className={ARROW_MOTION} />
        </span>
      )}
    </button>
  );
}

function MonthBox({
  month,
  role,
  tint,
  statuses,
  onOpen,
  highlight = false,
}: {
  month: PodcastMonth;
  role: string;
  tint: string;
  statuses: Map<string, ThemeStatus>;
  onOpen: () => void;
  highlight?: boolean;
}) {
  const empty = month.episodes === 0;
  const shown = month.themes.slice(0, 6);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={empty}
      aria-label={`Open the full ${month.longLabel} summary`}
      className={`group flex h-full w-full min-w-0 flex-col rounded-2xl p-4 text-left disabled:cursor-default sm:p-5 ${TILE_MOTION}`}
      style={{
        background: highlight ? `linear-gradient(140deg, #ffffff 0%, ${withAlpha(tint, 0.07)} 100%)` : '#ffffff',
        boxShadow: `inset 0 3px 0 0 ${tint}, 0 0 0 1px rgba(226,232,240,0.7), 0 1px 2px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.06)`,
      }}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: tint }}>
            {role}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="font-display text-[19px] font-bold leading-tight text-slate-900">{month.longLabel}</span>
            {month.mtd && <MtdBadge />}
          </div>
          <div className="tnum mt-0.5 text-[11.5px] text-slate-500">
            {plural(month.episodes, 'episode')} · {plural(month.shows.length, 'show')} · {month.summarised} analysed
          </div>
        </div>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${ICON_MOTION}`}
          style={{ background: withAlpha(tint, 0.1), color: tint }}
        >
          <CalendarDays size={17} strokeWidth={2.2} />
        </span>
      </div>

      <ToneBar counts={month.toneCounts} className="mt-3 w-full" />

      {month.headline && (
        <p className="mt-3 border-l-2 pl-2.5 text-[13px] font-medium leading-snug text-slate-800" style={{ borderColor: tint }}>
          {month.headline}
        </p>
      )}

      <div className="mt-3 flex w-full items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">
        <span>{month.ai ? 'Themes' : 'Lead points'}</span>
        {month.themes.length > 0 && <span className="tnum">{month.themes.length}</span>}
      </div>
      {shown.length ? (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {shown.map((t) => {
            const st = statuses.get(norm(t.title));
            return (
              <li key={t.title} className="flex gap-2 text-[12.5px] leading-snug text-slate-700">
                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint }} />
                <span className="min-w-0">
                  {t.title}
                  {st && <StatusTag s={st} className="ml-1.5" />}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1.5 text-[12px] italic text-slate-400">
          {empty ? `No episodes captured for ${month.longLabel}.` : 'No themes captured.'}
        </p>
      )}
      {month.themes.length > shown.length && (
        <p className="mt-1.5 text-[11.5px] text-slate-400">+{month.themes.length - shown.length} more in the full summary</p>
      )}

      {!empty && (
        <span
          className="mt-auto inline-flex items-center gap-1 pt-4 text-[12.5px] font-semibold"
          style={{ color: tint === LAST_TINT ? '#475569' : tint }}
        >
          Read the full month summary <ArrowRight size={14} strokeWidth={2.4} className={ARROW_MOTION} />
        </span>
      )}
    </button>
  );
}

function ContinuityCard({
  compare,
  last,
  cur,
  accent,
  pairs,
}: {
  compare: PodcastCompare | null;
  last: PodcastMonth;
  cur: PodcastMonth;
  accent: string;
  pairs?: { value: Pair; onChange: (p: Pair) => void; options: { value: Pair; label: string }[] };
}) {
  const topics = compare?.basis === 'topics';
  // A month still running hasn't "dropped" anything yet — it just hasn't come up so far.
  const goneWord = cur.mtd ? 'not raised yet' : 'dropped off';
  const continued = (compare?.continued ?? []).map((c) => ({
    key: `${c.last}→${c.this}`,
    title: c.this,
    sub: norm(c.last) !== norm(c.this) ? `${last.label}: ${c.last}` : undefined,
    note: c.note,
  }));
  const dropped = (compare?.dropped ?? []).map((d) => ({ key: d.theme, title: d.theme, note: d.note }));
  const fresh = (compare?.new ?? []).map((n) => ({ key: n.theme, title: n.theme, note: n.note }));
  return (
    <Card className="mb-4" accent={accent}>
      <CardHeader
        icon={GitCompareArrows}
        accent={accent}
        title={`What carried over — ${topics ? 'topics' : 'themes'}`}
        subtitle={
          compare
            ? `${monthTag(last)} → ${monthTag(cur)} · ${continued.length} continued · ${dropped.length} ${goneWord} · ${fresh.length} new`
            : `${monthTag(last)} → ${monthTag(cur)}`
        }
      />
      {pairs && (
        <div className="mb-3.5">
          <Segmented size="sm" value={pairs.value} onChange={pairs.onChange} options={pairs.options} />
        </div>
      )}
      {compare ? (
        <>
          {compare.read && <p className="mb-3.5 text-[13.5px] leading-relaxed text-slate-700">{compare.read}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Bucket kind="continued" title="Continued" hint={cur.mtd ? `in ${last.label} and so far in ${cur.label}` : 'talked about in both months'} items={continued} />
            <Bucket
              kind="dropped"
              title={cur.mtd ? 'Not raised yet' : 'Dropped off'}
              hint={cur.mtd ? `in ${last.label}, not yet in ${cur.label}` : `in ${last.label}, gone in ${cur.label}`}
              items={dropped}
            />
            <Bucket kind="new" title={`New in ${cur.label}`} hint={`not in ${last.label}`} items={fresh} />
          </div>
          {topics && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-slate-400">
              <Info size={12} className="mt-px shrink-0" />
              <span>
                Matched on the companies and subjects each episode's analysis names (exact names, no AI)
                {compare.minCount ? `; "${goneWord}" and "new" list those named by ${compare.minCount}+ episodes` : ''}.{' '}
                {cur.mtd || cur.aiEpisodes != null
                  ? 'When this month has an AI summary, whole themes are matched instead.'
                  : 'The monthly AI edition matches whole themes instead.'}
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="text-[13px] text-slate-500">
          {last.episodes === 0
            ? `No episodes were captured for ${last.longLabel}, so there is nothing to compare ${cur.longLabel} against yet.`
            : `No episodes ${cur.mtd ? 'yet' : 'were captured'} in ${cur.longLabel} to compare with ${last.longLabel}.`}
        </p>
      )}
    </Card>
  );
}

function Bucket({
  kind,
  title,
  hint,
  items,
}: {
  kind: ThemeStatus;
  title: string;
  hint: string;
  items: { key: string; title: string; sub?: string; note?: string }[];
}) {
  const [all, setAll] = useState(false);
  const st = STATUS[kind];
  const Icon = st.icon;
  const cap = 6;
  const shown = all ? items : items.slice(0, cap);
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-white/80 p-3 ring-1 ring-slate-200/70">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: withAlpha(st.color, 0.12), color: st.color }}>
            <Icon size={13} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-[13px] font-bold leading-tight text-slate-900">{title}</div>
            <div className="text-[10.5px] leading-tight text-slate-400">{hint}</div>
          </div>
        </div>
        <span className="tnum shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: withAlpha(st.color, 0.1), color: st.color }}>
          {items.length}
        </span>
      </div>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {shown.map((it) => (
            <li key={it.key} className="text-[12.5px] leading-snug">
              <div className="flex gap-1.5">
                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: st.color }} />
                <span className="font-medium text-slate-800">{it.title}</span>
              </div>
              {it.sub && <div className="ml-3 mt-0.5 text-[11px] text-slate-400">{it.sub}</div>}
              {it.note && <div className="ml-3 mt-0.5 text-[11.5px] text-slate-500">{it.note}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] italic text-slate-400">None</p>
      )}
      {items.length > cap && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-2 self-start text-[11.5px] font-semibold text-slate-500 transition hover:text-slate-800"
        >
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full month summary (modal).

function MonthSummaryModal({
  monthly,
  side,
  pair,
  accent,
  onSide,
  onClose,
}: {
  monthly: PodcastMonthly;
  side: Side;
  pair: Pair;
  accent: string;
  onSide: (s: Side) => void;
  onClose: () => void;
}) {
  const C = monthly.currentMonth ?? null;
  const month = monthOfSide(monthly, side) ?? monthly.thisMonth;
  const latest: Side = C ? 'current' : 'this';
  const tint = side === latest ? accent : LAST_TINT;
  const { statuses, counterpart, other, forward } = sideLinks(monthly, pair, side);
  const sides: { value: Side; label: string }[] = [
    { value: 'last', label: monthTag(monthly.lastMonth) },
    { value: 'this', label: monthTag(monthly.thisMonth) },
    ...(C ? [{ value: 'current' as Side, label: monthTag(C) }] : []),
  ];
  // A month-to-date AI summary covers the episodes up to its own date only.
  const mtdAI = month.ai && month.aiEpisodes != null;
  const aiEps = month.aiEpisodes ?? month.episodes;
  const aiSum = month.aiSummarised ?? month.summarised;
  const topics = month.topics ?? [];

  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div className="anim-fade fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${month.longLabel} podcast summary`}
        className="relative mx-auto w-full max-w-3xl animate-[pop-in_220ms_cubic-bezier(0.23,1,0.32,1)_both] overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-slate-200 motion-reduce:animate-none sm:my-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close summary"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/80 text-slate-500 ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-800"
        >
          <X size={16} strokeWidth={2.4} />
        </button>

        <header
          className="px-5 pb-5 pt-6 sm:px-8"
          style={{ background: `linear-gradient(135deg, ${withAlpha(tint, 0.13)} 0%, ${withAlpha(tint, 0.03)} 60%, #ffffff 100%)` }}
        >
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>
            Investor podcasts · {month.mtd ? 'month to date' : 'monthly summary'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 pr-10">
            <h2 className="font-display text-[26px] font-bold leading-tight text-slate-900">{month.longLabel}</h2>
            {month.mtd && <MtdBadge through={latestDate(month)} />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Stat value={month.episodes} label="episodes" />
            <Stat value={month.summarised} label="fully analysed" />
            <Stat value={month.shows.length} label="shows" />
            <Stat value={month.weeks.length} label={month.weeks.length === 1 ? 'week' : 'weeks'} />
          </div>
          <ToneBar counts={month.toneCounts} className="mt-3 max-w-md" />
          <div className="mt-4">
            <Segmented size="sm" value={side} onChange={onSide} options={sides} />
          </div>
        </header>

        <div className="px-5 pb-6 pt-5 sm:px-8">
          {month.episodes === 0 ? (
            <p className="text-[13px] italic text-slate-400">
              No episodes {month.mtd ? 'captured yet' : 'were captured'} for {month.longLabel}.
            </p>
          ) : (
            <>
              {month.ai ? (
                <section>
                  {mtdAI && (
                    <p className="tnum mb-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[11.5px] text-slate-500 ring-1 ring-slate-200/70">
                      <Info size={12} className="shrink-0" />
                      Written {month.aiAt ? dayMonth(month.aiAt) : '—'} from {plural(aiEps, 'episode')}
                      {aiEps < month.episodes ? ` — ${month.episodes - aiEps} more since, listed week by week below` : ''}
                    </p>
                  )}
                  <p className="font-display text-[19px] font-bold leading-snug text-slate-900">{month.headline}</p>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {month.overview.map((p, i) => (
                      <p key={i} className="text-[13.5px] leading-relaxed text-slate-700">
                        {p}
                      </p>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="flex items-start gap-2.5 rounded-xl bg-amber-50/70 px-3.5 py-3 text-[12.5px] leading-snug text-amber-800 ring-1 ring-amber-100">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">This month has no AI summary yet.</p>
                    <p className="mt-0.5 text-amber-700">
                      {month.mtd
                        ? `${month.longLabel} is still running. Below is each episode's own lead point and analysis, as published by the podcast tool — rebuilt on every refresh.`
                        : "Below is each episode's own lead point and analysis, as published by the podcast tool. The consolidated summary is written once a month, with the newsletter edition."}
                    </p>
                  </div>
                </div>
              )}

              {!month.ai && topics.length > 0 && (
                <ModalSection icon={Tag} title={month.mtd ? 'Most named so far' : 'Most named'} tint={tint}>
                  <TopicChips topics={topics} />
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
                    Companies and subjects named by the most episode analyses — counted, not written by AI.
                  </p>
                </ModalSection>
              )}

              <ModalSection
                icon={Layers}
                title={month.ai ? (month.mtd ? 'Themes so far' : 'Themes') : month.mtd ? 'Latest lead points' : 'Lead points'}
                count={month.themes.length}
                tint={tint}
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {month.themes.map((t) => {
                    const st = statuses.get(norm(t.title));
                    const link = counterpart.get(norm(t.title));
                    return (
                      <ThemeCard
                        key={t.title}
                        theme={t}
                        status={st}
                        link={
                          link && other && norm(link) !== norm(t.title)
                            ? `${forward ? `Continues in ${other.label} as` : `From ${other.label}`}: ${link}`
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </ModalSection>

              {month.numbers.length > 0 && (
                <ModalSection icon={Hash} title="Notable numbers" tint={tint}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {month.numbers.map((n, i) => (
                      <div key={i} className="rounded-xl bg-white p-3 ring-1 ring-slate-200/70">
                        <div className="tnum font-display text-[17px] font-bold leading-tight text-slate-900">{n.value}</div>
                        <div className="mt-1 text-[12px] font-medium leading-snug text-slate-700">{n.metric}</div>
                        {n.context && <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{n.context}</div>}
                      </div>
                    ))}
                  </div>
                </ModalSection>
              )}

              <ModalSection icon={CalendarDays} title="Week by week" count={month.weeks.length} tint={tint}>
                <ol className="ml-1.5 flex flex-col gap-4 border-l-2 border-slate-100 pl-4">
                  {month.weeks.map((w) => (
                    <WeekBlock key={w.id} week={w} tint={tint} defaultOpen={!month.ai} />
                  ))}
                </ol>
              </ModalSection>

              {month.ai && (month.tone || month.watch.length > 0) && (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {month.tone && (
                    <div className="rounded-xl bg-slate-50/70 p-3.5 ring-1 ring-slate-200/70">
                      <MiniLabel icon={Quote} tint={tint}>
                        Tone
                      </MiniLabel>
                      <p className="mt-1.5 text-[12.5px] leading-snug text-slate-700">{month.tone}</p>
                    </div>
                  )}
                  {month.watch.length > 0 && (
                    <div className="rounded-xl bg-slate-50/70 p-3.5 ring-1 ring-slate-200/70">
                      <MiniLabel icon={Eye} tint={tint}>
                        Threads to watch
                      </MiniLabel>
                      <ol className="mt-1.5 flex flex-col gap-1.5">
                        {month.watch.map((w, i) => (
                          <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-slate-700">
                            <span className="tnum shrink-0 font-display text-[11.5px] font-bold" style={{ color: tint }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <p className="mt-6 flex items-start gap-1.5 border-t border-slate-200 pt-3 text-[11px] leading-snug text-slate-400">
            <BookOpenText size={12} className="mt-px shrink-0" />
            <span>
              {month.ai
                ? `Consolidated by Claude on Amazon Bedrock${month.model ? ` (${month.model})` : ''}${month.aiAt ? ` on ${dateLabel(month.aiAt)}` : ''} from ${aiSum} episode ${aiSum === 1 ? 'analysis' : 'analyses'}${
                    aiEps > aiSum ? ` and the show notes of ${aiEps - aiSum} more` : ''
                  } — the same per-episode inputs as the podcast dashboard's weekly summaries. Nothing outside the episodes is used.${
                    mtdAI
                      ? month.mtd
                        ? ' Month to date: rewritten at most once a week; the counts, tone and week-by-week list update on every refresh.'
                        : ' Written before the month ended; the full-month summary comes with the monthly edition.'
                      : ''
                  }`
                : month.mtd || side === 'current'
                  ? "Built from the podcast tool's per-episode analyses, as published, on every refresh."
                  : `Built from the podcast tool's per-episode analyses, as published. ${monthly.note ?? ''}`}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ theme, status, link }: { theme: PodcastTheme; status?: ThemeStatus; link?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-slate-50/60 p-3 ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display text-[13.5px] font-bold leading-snug text-slate-900">{theme.title}</h4>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {theme.strength === 'major' && (
            <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-slate-500 ring-1 ring-slate-200">
              major
            </span>
          )}
          {status && <StatusTag s={status} />}
        </div>
      </div>
      {theme.summary && <p className="mt-1 text-[12.5px] leading-snug text-slate-600">{theme.summary}</p>}
      {link && <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{link}</p>}
      {(theme.shows.length > 0 || theme.episodeIds.length > 0) && (
        <div className="mt-auto flex flex-wrap items-center gap-1 pt-2">
          {theme.shows.map((s) => (
            <span key={s} className="rounded-md bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600 ring-1 ring-slate-200">
              {s}
            </span>
          ))}
          {theme.episodeIds.length > 0 && (
            <span className="tnum text-[10.5px] text-slate-400">· {plural(theme.episodeIds.length, 'episode')}</span>
          )}
        </div>
      )}
    </div>
  );
}

function WeekBlock({ week, tint, defaultOpen }: { week: PodcastWeek; tint: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="relative">
      <span
        className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white"
        style={{ background: tint, boxShadow: `0 0 0 1px ${withAlpha(tint, 0.35)}` }}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-[13.5px] font-bold text-slate-900">
          {week.label}
          <span className="tnum ml-2 text-[11px] font-medium text-slate-400">{plural(week.episodes.length, 'episode')}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-[11.5px] font-semibold text-slate-500 transition hover:text-slate-800"
        >
          {open ? 'Hide episodes' : 'Show episodes'}
        </button>
      </div>
      {week.line && <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">{week.line}</p>}
      {open && (
        <ul className="mt-2 flex flex-col divide-y divide-slate-100 rounded-xl bg-slate-50/60 ring-1 ring-slate-200/70">
          {week.episodes.map((e) => (
            <li key={e.id} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-400">
                <span className="font-semibold uppercase tracking-wide text-slate-500">{e.show}</span>
                <span className="tnum">{dateLabel(e.date)}</span>
                {e.tone && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor(e.tone) }} />
                    {e.tone}
                  </span>
                )}
                {!e.summarised && (
                  <span className="rounded bg-white px-1 text-[9.5px] font-semibold text-slate-400 ring-1 ring-slate-200">show notes only</span>
                )}
              </div>
              {e.url ? (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-start gap-1 text-[12.5px] font-semibold leading-snug text-slate-800 transition hover:text-indigo-600"
                >
                  {e.title}
                  <ExternalLink size={11} className="mt-[3px] shrink-0 opacity-50" />
                </a>
              ) : (
                <div className="mt-0.5 text-[12.5px] font-semibold leading-snug text-slate-800">{e.title}</div>
              )}
              {e.line && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-slate-500">{e.line}</p>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Small pieces.

function ToneBar({ counts, className = '' }: { counts: Record<string, number>; className?: string }) {
  const rank = (k: string) => (TONE_ORDER.indexOf(k) + 1 || 99);
  const entries = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => rank(a[0]) - rank(b[0]));
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return null;
  return (
    <div className={className}>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        {entries.map(([k, v]) => (
          <span key={k} style={{ width: `${(v / total) * 100}%`, background: toneColor(k) }} title={`${v} ${k}`} />
        ))}
      </div>
      <div className="tnum mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10.5px] text-slate-500">
        {entries.map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor(k) }} />
            {v} {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusTag({ s, className = '' }: { s: ThemeStatus; className?: string }) {
  const st = STATUS[s];
  return (
    <span
      className={`inline-block rounded px-1 py-0.5 align-[1px] text-[9px] font-bold uppercase leading-none tracking-wide ${className}`}
      style={{ background: withAlpha(st.color, 0.08), color: st.color, boxShadow: `inset 0 0 0 1px ${withAlpha(st.color, 0.22)}` }}
    >
      {st.label}
    </span>
  );
}

function MtdBadge({ through }: { through?: string }) {
  return (
    <span className="tnum rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-amber-700 ring-1 ring-amber-100">
      month to date{through ? ` · to ${dayMonth(through)}` : ''}
    </span>
  );
}

function TopicChips({ topics, className = '' }: { topics: NonNullable<PodcastMonth['topics']>; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {topics.map((t) => (
        <span
          key={t.name}
          title={`Named in ${plural(t.episodes, 'episode')} across ${plural(t.shows, 'show')}`}
          className="inline-flex items-baseline gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11.5px] font-medium text-slate-700 ring-1 ring-slate-200"
        >
          {t.name}
          <span className="tnum text-[10.5px] font-semibold text-slate-400">{t.episodes}</span>
        </span>
      ))}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="tnum inline-flex items-baseline gap-1 rounded-lg bg-white/80 px-2 py-1 text-[11.5px] text-slate-500 ring-1 ring-slate-200/70">
      <span className="font-display text-[14px] font-bold text-slate-900">{value}</span>
      {label}
    </span>
  );
}

function ModalSection({
  icon: Icon,
  title,
  count,
  tint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  tint: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: withAlpha(tint, 0.12), color: tint }}>
          <Icon size={13} strokeWidth={2.4} />
        </span>
        <h3 className="font-display text-[14px] font-bold text-slate-900">{title}</h3>
        {count != null && <span className="tnum text-[11.5px] font-semibold text-slate-400">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function MiniLabel({ icon: Icon, tint, children }: { icon: LucideIcon; tint: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">
      <Icon size={12} style={{ color: tint }} />
      {children}
    </div>
  );
}
