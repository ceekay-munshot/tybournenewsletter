import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';
import type { ConsolidatedData, ChangeBlock, Direction, SectorId } from '../types';
import { Table, type Column } from './ui/Table';
import { signedPct } from '../lib/format';
import { directionColor, sectorColor } from '../lib/brand';

interface Row {
  key: string;
  systemId: string;
  system: string;
  sector: SectorId;
  metric: string;
  period: string;
  changePct: number | null;
  direction: Direction;
  secondary: boolean;
}

const toRow = (b: ChangeBlock, systemId: string, systemName: string, sector: SectorId, secondary: boolean): Row => ({
  key: `${systemId}::${b.metricLabel}${secondary ? '::s' : ''}`,
  systemId,
  system: systemName,
  sector,
  metric: b.metricLabel,
  period: `${b.lastPeriodLabel} → ${b.thisPeriodLabel}`,
  changePct: b.changePct,
  direction: b.direction,
  secondary,
});

function flatten(data: ConsolidatedData): Row[] {
  const rows: Row[] = [];
  for (const b of data.systems) {
    if (b.status === 'error') continue;
    rows.push(toRow(b, b.systemId, b.name, b.sector, false));
    for (const s of b.secondaryMetrics ?? []) rows.push(toRow(s, b.systemId, b.name, b.sector, true));
  }
  return rows.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
}

const DirIcon = ({ d }: { d: Direction }) => {
  const Icon = d === 'up' ? ArrowUpRight : d === 'down' ? ArrowDownRight : ArrowRight;
  return <Icon size={15} strokeWidth={2.6} style={{ color: directionColor(d) }} />;
};

/** The complete "what changed" view: every headline + secondary metric, sortable. */
export function MasterTable({ data, onSelect }: { data: ConsolidatedData; onSelect: (id: string) => void }) {
  const rows = useMemo(() => flatten(data), [data]);

  const columns: Column<Row>[] = [
    {
      key: 'system',
      header: 'System',
      sortable: true,
      sortValue: (r) => r.system,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: sectorColor(r.sector) }} />
          <span className={r.secondary ? 'text-slate-500' : 'font-semibold text-slate-800'}>{r.system}</span>
        </span>
      ),
    },
    {
      key: 'metric',
      header: 'Metric',
      sortable: true,
      sortValue: (r) => r.metric,
      render: (r) => (
        <span className="text-slate-600">
          {r.secondary && <span className="mr-1 text-slate-300">↳</span>}
          {r.metric}
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (r) => <span className="tnum whitespace-nowrap text-slate-500">{r.period}</span>,
    },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.changePct ?? 0,
      render: (r) => (
        <span className="tnum font-bold" style={{ color: directionColor(r.direction) }}>
          {r.changePct != null ? signedPct(r.changePct) : '—'}
        </span>
      ),
    },
    {
      key: 'dir',
      header: '',
      align: 'center',
      width: 36,
      render: (r) => (
        <span className="inline-flex justify-center">
          <DirIcon d={r.direction} />
        </span>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={rows}
      getKey={(r) => r.key}
      onRowClick={(r) => onSelect(r.systemId)}
      dense
      maxHeight={520}
    />
  );
}
