import { type LucideIcon } from 'lucide-react';
import type { ChangeBlock } from '../types';
import { iconFor } from '../lib/icons';
import { navLabel } from '../lib/labels';
import { sectorColor } from '../lib/brand';

/** Left-hand dashboard navigation. One item per dashboard, labelled by its display
 *  name only — no figures, so the list reads as a plain menu. On phones it collapses
 *  to a sticky, horizontally-scrolling strip under the header. */
export function Sidebar({
  systems,
  activeId,
  onSelect,
}: {
  systems: ChangeBlock[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="no-print md:w-60 md:shrink-0">
      <div className="scroll-thin sticky top-[52px] z-30 flex gap-1 overflow-x-auto border-b border-slate-200/80 bg-white/80 p-2 backdrop-blur-md md:top-[53px] md:max-h-[calc(100vh-53px)] md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="hidden px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:block">
          Dashboards
        </div>
        {systems.map((b) => (
          <SidebarItem
            key={b.systemId}
            icon={iconFor(b.systemId, b.sector)}
            iconColor={sectorColor(b.sector)}
            label={navLabel(b.systemId, b.name)}
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
  active,
  onClick,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
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
    </button>
  );
}
