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
  direction: Direction;
}

export interface TrendPoint {
  period: string;
  value: number;
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
  asOf: string;
  isStale?: boolean;
  breakdown: BreakdownRow[];
  trend?: TrendPoint[];
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
