// The data contract shared by the pipeline (scripts/) and the dashboard (src/).

export type Direction = 'up' | 'down' | 'flat';
export type SectorId = 'technology' | 'industrial' | 'financial' | 'macro';
export type Comparison = 'QoQ' | 'MoM' | 'WoW';
export type BlockStatus = 'ok' | 'partial' | 'error';

export interface BreakdownRow {
  label: string;
  thisValue: number | null;
  lastValue: number | null;
  changePct: number | null;
  /** Absolute change + how to read it, for pp/pts metrics (e.g. sentiment points). */
  changeAbs?: number | null;
  changeDisplay?: 'pct' | 'pp' | 'pts';
  direction: Direction;
  /** The step BEFORE last — the prior comparison, so the table shows two consecutive
   *  periods of trend. prevValue is the value one period before lastValue; prevChangePct/
   *  prevChangeAbs are the move from prevValue → lastValue. */
  prevValue?: number | null;
  prevChangePct?: number | null;
  prevChangeAbs?: number | null;
  prevDirection?: Direction;
  /** The last N periods (oldest→newest) for this row — renders as value + change columns
   *  when present, superseding the single prev/last/this triple. */
  series?: SeriesPoint[];
  /** Optional second level (e.g. parent brands within a product-line category). */
  sub?: BreakdownRow[];
  /** Flagged when the move is large enough to call out. */
  bigMove?: boolean;
  /** Honest note when there's no change to show (e.g. "not distributed"). */
  note?: string;
}

export interface TrendPoint {
  period: string;
  value: number;
}

/** One point in a multi-period trend — a period's value plus the change INTO it from the
 *  previous point. A `series` of these renders the last N periods as value + change
 *  columns (the founder's "last 3-4 periods" view). The first point carries no change. */
export interface SeriesPoint {
  label: string;
  value: number | null;
  changePct: number | null;
  changeAbs: number | null;
  direction: Direction;
}

/** One cell in a supporting table — pre-formatted text plus optional direction colour. */
export interface AuxCell {
  text: string;
  tone?: Direction;
  bold?: boolean;
}

/** A generic supporting table rendered as a bordered table under the main breakdown
 *  (e.g. 13F sector flows / entries / exits, Taiwan accelerating vs decelerating).
 *  Cells are pre-formatted in the connector so the renderer stays dumb. */
export interface AuxTable {
  title: string;
  subtitle?: string;
  headers: string[];
  /** Per-column alignment; defaults to left for column 0, right for the rest. */
  align?: ('left' | 'right')[];
  rows: AuxCell[][];
}

/** A lifted narrative insight (e.g. SAP's "why sentiment moved" key findings,
 *  or a one-line standout read), with an honest "as of" date for staleness. */
export interface InsightItem {
  title: string;
  body?: string;
  bullets?: string[];
  asOf?: string;
  tone?: string;
}

/** One period's read for a dashboard that supports a Weekly/MoM/QoQ toggle.
 *  When a ChangeBlock carries `views`, the UI renders a toggle and these self-
 *  contained period views replace the single-period breakdown. */
export interface PeriodView {
  comparison: Comparison;
  /** Short toggle label, e.g. "Week" | "Month" | "Quarter". */
  label: string;
  /** false => this window can't be computed yet (shown greyed, never faked). */
  available: boolean;
  unavailableReason?: string;
  thisPeriodLabel: string;
  lastPeriodLabel: string;
  thisValue: number | null;
  lastValue: number | null;
  changePct: number | null;
  changeAbs: number | null;
  changeDisplay?: 'pct' | 'pp' | 'pts';
  direction: Direction;
  bigMove?: boolean;
  /** The prior comparison (one step further back) so the headline + table show two
   *  consecutive periods. prevLabel is the period before lastPeriodLabel (e.g. "Aug '26"),
   *  prevValue its overall value, prevChangePct/prevChangeAbs the prevLabel→lastPeriodLabel move. */
  prevLabel?: string;
  prevValue?: number | null;
  prevChangePct?: number | null;
  prevChangeAbs?: number | null;
  prevDirection?: Direction;
  /** The last N periods (oldest→newest) for the headline — when present the table shows
   *  these as value + change columns instead of the prev/last/this triple. */
  series?: SeriesPoint[];
  breakdown: BreakdownRow[];
  summary?: string;
  notes?: string;
}

export interface ChangeBlock {
  systemId: string;
  name: string;
  sector: SectorId;
  metricLabel: string;
  unit: string;
  comparison: Comparison;
  thisPeriodLabel: string;
  lastPeriodLabel: string;
  thisValue: number | null;
  lastValue: number | null;
  changePct: number | null;
  changeAbs: number | null;
  direction: Direction;
  /** How the headline change should read: percent (default), percentage points, or points. */
  changeDisplay?: 'pct' | 'pp' | 'pts';
  /** The prior comparison (mirrors the default view) so the overview + newsletter can show
   *  two consecutive periods of trend. Copied from the default view in consolidation. */
  prevLabel?: string;
  prevValue?: number | null;
  prevChangePct?: number | null;
  prevChangeAbs?: number | null;
  prevDirection?: Direction;
  /** The default view's last-N-periods series, mirrored onto the block so the newsletter
   *  can render the same multi-period table as the dashboard. */
  series?: SeriesPoint[];
  asOf: string;
  isStale?: boolean;
  breakdown: BreakdownRow[];
  trend?: TrendPoint[];
  /** Weekly/MoM/QoQ toggle views. When present the dashboard renders a period
   *  toggle and these drive the drill-down (the top-level fields stay as the
   *  default view so the overview table/cards/movers keep working). */
  views?: PeriodView[];
  /** Labels for the two breakdown dimensions in the multi-period view, e.g.
   *  "product line" + "brand" (Schneider) or "segment" + "vendor" (CPU). */
  breakdownNoun?: string;
  subNoun?: string;
  /** Title for the breakdown chart, e.g. "Price change" or "Sentiment change". */
  changeNoun?: string;
  /** Optional override for the breakdown chart's subtitle. When set, replaces the
   *  default "<Period>-over-<period>" line — used when the breakdown is a separate
   *  lens from the headline (e.g. a lagged regional snapshot). */
  breakdownSubtitle?: string;
  /** Lifted narrative ("why it moved") — shown as cards in the multi-period view. */
  insights?: InsightItem[];
  /** Supporting tables rendered under the main breakdown (sector flows, entries/exits,
   *  accelerating vs decelerating, etc.). */
  auxTables?: AuxTable[];
  /** Metric-toggle groups of supporting tables (e.g. TI "UBS Compare" vs "Price").
   *  When present the view renders a toggle over the group labels and shows the
   *  selected group's tables. */
  auxTableGroups?: { label: string; tables: AuxTable[] }[];
  /** For narrative cards (e.g. podcast themes): recurring themes + an optional tone read. */
  highlights?: string[];
  tone?: string;
  /** Podcast narrative quarter-over-quarter: the PRIOR quarter's recurring themes +
   *  tone, this quarter's bare tone, and the themes that are NEW this quarter — so the
   *  card can show last-quarter-vs-this-quarter side by side. */
  prevHighlights?: string[];
  newHighlights?: string[];
  thisTone?: string;
  prevTone?: string;
  /** A consolidated written note (e.g. the podcast quarter-over-quarter read). */
  summary?: string;
  /** Other things that moved in this system (same shape, rendered smaller). */
  secondaryMetrics?: ChangeBlock[];
  sourceName: string;
  sourceUrl: string;
  dashboardUrl?: string | null;
  notes?: string;
  status: BlockStatus;
  statusReason?: string;
}

export interface SectorDef {
  id: SectorId;
  label: string;
  color: string;
}

export interface ClientInfo {
  id: string;
  name: string;
  shortName: string;
  publishedBy: string;
}

export interface ConsolidatedData {
  generatedAt: string;
  client: ClientInfo;
  sectors: SectorDef[];
  systems: ChangeBlock[];
}

// ---- AI newsletter (scripts/newsletter.mjs -> clients/<client>/data/newsletter.json) ----

/** 'ok' = AI edition written; 'no-key' = Bedrock not configured (honest, no prose);
 *  'error' = model failed / returned malformed JSON (honest, no prose). */
export type NewsletterStatus = 'ok' | 'no-key' | 'error';

export interface NewsletterSystemLine {
  systemId: string;
  line: string;
}

export interface Newsletter {
  generatedAt: string;
  status: NewsletterStatus;
  provider?: string;
  model?: string;
  region?: string;
  dataHash?: string;
  note?: string;
  /** AI-written fields — null/empty unless status === 'ok'. Never fabricated. */
  editionLabel: string | null;
  executiveSummary: string | null;
  /** One written line per dashboard (what moved + why), keyed by systemId. */
  lines: NewsletterSystemLine[];
  watchList: string[];
  methodNote: string | null;
}

// ---- Podcast monthly summaries (scripts/podcast-monthly.mjs -> clients/<client>/data/podcast-monthly.json) ----

/** One episode in a month's week-by-week list. */
export interface PodcastEpisodeRef {
  id: string;
  show: string;
  title: string;
  date: string;
  url?: string;
  /** false => only the title + show notes exist (the podcast tool hasn't analysed it yet). */
  summarised: boolean;
  tone?: string;
  /** One-line read: what changed, else the lead point, else the show notes. */
  line?: string;
}

export interface PodcastWeek {
  id: string;
  /** e.g. "5–11 Oct" (Monday-start weeks, clipped to the month). */
  label: string;
  /** AI one-liner for the week — null without AI. */
  line: string | null;
  episodes: PodcastEpisodeRef[];
}

export interface PodcastTheme {
  title: string;
  summary?: string;
  shows: string[];
  episodeIds: string[];
  strength?: 'major' | 'minor';
}

/** One calendar month of investor podcasts. With `ai` the headline/overview/themes were
 *  written by the model from every episode's analysis; without it the themes are each
 *  episode's own lead point and the prose fields are empty. Never fabricated. */
export interface PodcastMonth {
  id: string;
  label: string;
  longLabel: string;
  mtd: boolean;
  episodes: number;
  summarised: number;
  shows: string[];
  toneCounts: Record<string, number>;
  weeks: PodcastWeek[];
  ai: boolean;
  model?: string;
  /** When the AI summary was written (it is rewritten at most once a day). */
  aiAt?: string;
  headline: string | null;
  overview: string[];
  themes: PodcastTheme[];
  numbers: { value: string; metric: string; context?: string }[];
  tone: string | null;
  watch: string[];
}

/** Which of last month's themes continued, dropped off, or are new this month.
 *  'themes' = the model matched the two months' themes; 'topics' = exact match on the
 *  companies/subjects the episode analyses name (no AI). */
export interface PodcastCompare {
  basis: 'themes' | 'topics';
  ai: boolean;
  model?: string;
  read: string | null;
  continued: { last: string; this: string; note?: string }[];
  dropped: { theme: string; note?: string }[];
  new: { theme: string; note?: string }[];
}

export interface PodcastMonthly {
  generatedAt: string;
  systemId: string;
  status: 'ok' | 'no-key' | 'error';
  provider?: string;
  region?: string;
  note?: string;
  sourceName?: string;
  sourceUrl?: string;
  lastMonth: PodcastMonth;
  thisMonth: PodcastMonth;
  /** null when last month has no episodes to compare against. */
  compare: PodcastCompare | null;
}
