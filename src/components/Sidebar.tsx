import { Fragment } from 'react';
import { type LucideIcon } from 'lucide-react';
import type { ChangeBlock, SectorDef } from '../types';
import { iconFor } from '../lib/icons';
import { navLabel } from '../lib/labels';
import { sectorColor } from '../lib/brand';

/** Left-hand dashboard navigation. One item per dashboard, labelled by its display
 *  name only — no figures, so the list reads as a plain menu — and grouped under its
 *  sector (Technology, Industrial, …) in config order. On phones it collapses to a
 *  sticky, horizontally-scrolling strip under the header (sector headings hidden). */
export function Sidebar({
  sectors,
  systems,
  activeId,
  onSelect,
}: {
  sectors: SectorDef[];
  systems: ChangeBlock[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const groups: { id: string; label: string; color: string; items: ChangeBlock[] }[] = sectors
    .map((sec) => ({ ...sec, items: systems.filter((b) => b.sector === sec.id) }))
    .filter((g) => g.items.length);
  // Never drop a dashboard whose sector isn't in the config list.
  const other = systems.filter((b) => !sectors.some((sec) => sec.id === b.sector));
  if (other.length) groups.push({ id: 'other', label: 'Other', color: '#94A3B8', items: other });

  return (
    <nav className="no-print md:w-60 md:shrink-0">
      <div className="scroll-thin sticky top-[52px] z-30 flex gap-1 overflow-x-auto border-b border-slate-200/80 bg-white/80 p-2 backdrop-blur-md md:top-[53px] md:max-h-[calc(100vh-53px)] md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r">
        {groups.map((g, i) => (
          <Fragment key={g.id}>
            <div
              className={`hidden items-center gap-1.5 px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:flex ${
                i === 0 ? 'pt-1' : 'pt-3'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
              {g.label}
            </div>
            {g.items.map((b) => (
              <SidebarItem
                key={b.systemId}
                icon={iconFor(b.systemId, b.sector)}
                iconColor={sectorColor(b.sector)}
                label={navLabel(b.systemId, b.name)}
                active={activeId === b.systemId}
                onClick={() => onSelect(b.systemId)}
              />
            ))}
          </Fragment>
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
