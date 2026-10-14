import type { ChangeBlock, SectorDef } from '../types';
import { ChangeCard } from './ChangeCard';
import { SECTOR_ICON } from '../lib/icons';
import { shade, withAlpha } from '../lib/brand';

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
      <div
        className="mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2"
        style={{
          background: `linear-gradient(90deg, ${withAlpha(sector.color, 0.18)}, ${withAlpha(sector.color, 0.04)})`,
          boxShadow: `inset 3px 0 0 0 ${sector.color}`,
        }}
      >
        {Icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg text-white shadow-sm" style={{ background: sector.color }}>
            <Icon size={15} strokeWidth={2.4} />
          </span>
        )}
        <h3 className="font-display text-[15px] font-bold" style={{ color: shade(sector.color, -0.45) }}>
          {sector.label}
        </h3>
        <span
          className="tnum rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white"
          style={{ background: sector.color }}
        >
          {blocks.length}
        </span>
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
