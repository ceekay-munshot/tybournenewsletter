import type { ConsolidatedData, SectorDef } from '../types';
import { PageHeader } from '../components/ui/Card';
import { ChangeCard } from '../components/ChangeCard';
import { SECTOR_ICON } from '../lib/icons';
import { bySector } from '../lib/data';

export function SectorTab({
  data,
  sector,
  onSelect,
}: {
  data: ConsolidatedData;
  sector: SectorDef;
  onSelect: (id: string) => void;
}) {
  const blocks = bySector(data, sector.id);
  const Icon = SECTOR_ICON[sector.id];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {Icon && <Icon size={22} strokeWidth={2.3} style={{ color: sector.color }} />}
            {sector.label}
          </span>
        }
        subtitle={
          blocks.length
            ? `${blocks.length} system${blocks.length === 1 ? '' : 's'} tracked — what changed going into earnings.`
            : undefined
        }
      />

      {blocks.length === 0 ? (
        <div className="rounded-2xl bg-white/60 px-5 py-10 text-center ring-1 ring-slate-200/70">
          <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full" style={{ background: `${sector.color}1A`, color: sector.color }}>
            {Icon && <Icon size={18} strokeWidth={2.2} />}
          </div>
          <p className="text-[13.5px] font-semibold text-slate-700">No {sector.label.toLowerCase()} systems yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-slate-500">
            This sector comes online in an upcoming update. The dashboard engine already supports it — each new system
            plugs in with one config entry and one connector.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((b) => (
            <ChangeCard key={b.systemId} block={b} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
