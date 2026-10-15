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
  /** Lifted narrative ("why it moved") — shown as cards in the multi-period view. */
  insights?: InsightItem[];
  /** For narrative cards (e.g. podcast themes): recurring themes + an optional tone read. */
  highlights?: string[];
  tone?: string;
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

export interface NewsletterSector {
  sector: SectorId | string;
  summary: string;
  systems: NewsletterSystemLine[];
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
  quarterLabel: string | null;
  executiveSummary: string | null;
  bySector: NewsletterSector[];
  watchList: string[];
  methodNote: string | null;
}
