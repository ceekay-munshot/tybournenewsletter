import type { ConsolidatedData } from '../types';
import { PageHeader, Card } from '../components/ui/Card';
import { MasterTable } from '../components/MasterTable';
import { ChangeCard } from '../components/ChangeCard';
import { headlineMagnitude } from '../lib/format';
import { Table2 } from 'lucide-react';

/** The landing view: a single "everything that moved" table (the client's
 *  preferred at-a-glance), then one card per dashboard, ranked by how much it
 *  moved. No sector grouping — dashboards stand on their own. */
export function Overview({ data, onSelect }: { data: ConsolidatedData; onSelect: (id: string) => void }) {
  const cards = [...data.systems].sort(
    (a, b) =>
      Math.abs(headlineMagnitude(b.changePct, b.changeAbs, b.changeDisplay) ?? -1) -
      Math.abs(headlineMagnitude(a.changePct, a.changeAbs, a.changeDisplay) ?? -1)
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="What moved — across every dashboard."
        subtitle={`${data.systems.length} dashboards tracked. Every figure is real and source-stamped — pick a dashboard on the left, or click any row to drill in.`}
      />

      <Card className="mb-5" pad={false}>
        <div className="flex items-center gap-2.5 p-4 pb-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: '#6366F114', color: '#6366F1' }}>
            <Table2 size={17} strokeWidth={2.2} />
          </span>
          <div>
            <h3 className="font-display text-[15px] font-bold text-slate-900">Everything that moved</h3>
            <p className="text-[12px] text-slate-500">
              Every headline and secondary metric across all dashboards — click a column to sort, click a row to drill in.
            </p>
          </div>
        </div>
        <div className="px-4 pb-4">
          <MasterTable data={data} onSelect={onSelect} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((b) => (
          <ChangeCard key={b.systemId} block={b} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
