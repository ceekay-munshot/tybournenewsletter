import type { ConsolidatedData } from '../types';
import { PageHeader, Card, CardHeader } from '../components/ui/Card';
import { Legend } from '../components/charts/ChartBase';
import { MoversChart } from '../components/MoversChart';
import { MasterTable } from '../components/MasterTable';
import { SectorSection } from '../components/SectorSection';
import { bySector } from '../lib/data';
import { DIRECTION_COLOR } from '../lib/brand';
import { TrendingUp, Table2 } from 'lucide-react';

export function Overview({ data, onSelect }: { data: ConsolidatedData; onSelect: (id: string) => void }) {
  const liveCount = data.systems.filter((s) => s.status !== 'error' && s.changePct != null).length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Going into earnings — what moved."
        subtitle={`${liveCount} live system${liveCount === 1 ? '' : 's'} across ${data.sectors.length} sectors. Every figure is real and source-stamped — click any system to open its breakdown.`}
      />

      <Card className="mb-5">
        <CardHeader
          icon={TrendingUp}
          accent="#6366F1"
          title="Biggest movers this quarter"
          subtitle="Headline change per system, largest first. Green = up, red = down."
          right={
            <Legend
              items={[
                { label: 'Up', color: DIRECTION_COLOR.up },
                { label: 'Down', color: DIRECTION_COLOR.down },
                { label: 'Flat', color: DIRECTION_COLOR.flat },
              ]}
            />
          }
        />
        <MoversChart systems={data.systems} onSelect={onSelect} />
      </Card>

      <Card className="mb-5" pad={false}>
        <div className="flex items-center gap-2.5 p-4 pb-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: '#6366F114', color: '#6366F1' }}>
            <Table2 size={17} strokeWidth={2.2} />
          </span>
          <div>
            <h3 className="font-display text-[15px] font-bold text-slate-900">Everything that moved</h3>
            <p className="text-[12px] text-slate-500">Every headline and secondary metric across all systems — click a column to sort, click a row to drill in.</p>
          </div>
        </div>
        <div className="px-4 pb-4">
          <MasterTable data={data} onSelect={onSelect} />
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        {data.sectors.map((sector) => (
          <SectorSection key={sector.id} sector={sector} blocks={bySector(data, sector.id)} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
