import type { ChangeBlock, SectorDef } from '../types';
import { ChangeCard } from './ChangeCard';
import { SECTOR_ICON } from '../lib/icons';

/** A colour-headed sector band with its grid of change cards. Empty sectors show
 *  an honest "arriving soon" line (later prompts add the remaining systems). */
export function SectorSection({
  sector,
  blocks,
  onSelect,
}: {
  sector: SectorDef;
  blocks: ChangeBlock[];
  onSelect: (id: string) => void;
}) {
  const Icon = SECTOR_ICON[sector.id];
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="h-5 w-1.5 rounded-full" style={{ background: sector.color }} />
        {Icon && <Icon size={16} strokeWidth={2.3} style={{ color: sector.color }} />}
        <h3 className="font-display text-[15px] font-bold text-slate-900">{sector.label}</h3>
        <span
          className="tnum rounded-full px-1.5 py-0.5 text-[10.5px] font-bold"
          style={{ background: `${sector.color}1A`, color: sector.color }}
        >
          {blocks.length}
        </span>
        <span className="ml-1 h-px flex-1" style={{ background: `${sector.color}22` }} />
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-2xl bg-white/60 px-4 py-3 text-[12.5px] text-slate-400 ring-1 ring-slate-200/70">
          Systems arriving in an upcoming update.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((b) => (
            <ChangeCard key={b.systemId} block={b} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}
