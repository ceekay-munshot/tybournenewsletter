import { LayoutGrid, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChangeBlock } from '../types';
import { iconFor } from '../lib/icons';
import { repoLabel } from '../lib/labels';
import { directionColor, sectorColor } from '../lib/brand';
import { headlineText } from '../lib/format';

/** Left-hand dashboard navigation. One item per dashboard (labelled by its source
 *  repo for now), plus an Overview item. On phones it collapses to a sticky,
 *  horizontally-scrolling strip under the header. */
export function Sidebar({
  systems,
  activeId,
  onOverview,
  onSelect,
}: {
  systems: ChangeBlock[];
  activeId: string | null;
  onOverview: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="no-print md:w-60 md:shrink-0">
      <div className="scroll-thin sticky top-[52px] z-30 flex gap-1 overflow-x-auto border-b border-slate-200/80 bg-white/80 p-2 backdrop-blur-md md:top-[53px] md:max-h-[calc(100vh-53px)] md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r">
        <SidebarItem icon={LayoutGrid} iconColor="#6366F1" label="Overview" active={activeId === null} onClick={onOverview} />
        <div className="hidden px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:block">
          Dashboards
        </div>
        {systems.map((b) => (
          <SidebarItem
            key={b.systemId}
            icon={iconFor(b.systemId, b.sector)}
            iconColor={sectorColor(b.sector)}
            label={repoLabel(b.systemId, b.name)}
            right={<ChangeChip block={b} />}
            active={activeId === b.systemId}
            onClick={() => onSelect(b.systemId)}
          />
        ))}
      </div>
    </nav>
  );
}

function SidebarItem({
  icon: Icon,
  iconColor,
  label,
  right,
  active,
  onClick,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  right?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`group flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold transition md:w-full ${
        active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
        style={{
          background: active ? 'rgba(255,255,255,0.16)' : `${iconColor}14`,
          color: active ? '#ffffff' : iconColor,
        }}
      >
        <Icon size={14} strokeWidth={2.3} />
      </span>
      <span className="truncate">{label}</span>
      {right && <span className="ml-auto hidden shrink-0 pl-1 md:inline">{right}</span>}
    </button>
  );
}

/** A compact, direction-coloured headline change for the nav. Narrative cards
 *  (no plottable headline) and error states fall back gracefully. */
function ChangeChip({ block }: { block: ChangeBlock }) {
  if (block.status === 'error') return <span className="tnum text-[11px] text-slate-300">—</span>;
  const hasHeadline = block.changePct != null || (block.changeDisplay && block.changeAbs != null);
  if (!hasHeadline) return null;
  return (
    <span className="tnum text-[11px] font-bold" style={{ color: directionColor(block.direction) }}>
      {headlineText(block.changePct, block.changeAbs, block.changeDisplay)}
    </span>
  );
}
