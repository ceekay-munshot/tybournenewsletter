import type { ConsolidatedData } from '../types';
import { PageHeader, Card, CardHeader } from '../components/ui/Card';
import { Legend } from '../components/charts/ChartBase';
import { MoversChart } from '../components/MoversChart';
import { SectorSection } from '../components/SectorSection';
import { bySector } from '../lib/data';
import { DIRECTION_COLOR } from '../lib/brand';
import { TrendingUp } from 'lucide-react';

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

      <div className="flex flex-col gap-5">
        {data.sectors.map((sector) => (
          <SectorSection key={sector.id} sector={sector} blocks={bySector(data, sector.id)} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
