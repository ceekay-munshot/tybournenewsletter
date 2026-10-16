import { ShieldCheck, Newspaper } from 'lucide-react';
import type { ClientInfo } from '../types';
import { whenLabel } from '../lib/format';
import { MunshotMark } from './MunshotMark';

export function Header({
  client,
  generatedAt,
  onOpenNewsletter,
}: {
  client: ClientInfo;
  generatedAt: string;
  onOpenNewsletter: () => void;
}) {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <MunshotMark />
          <span className="hidden h-6 w-px bg-slate-200 sm:block" />
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-bold leading-tight text-slate-900 sm:text-base">
              {client.name}
            </div>
            <div className="truncate text-[11px] leading-tight text-slate-500">
              Consolidated monthly intelligence
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-100 lg:inline-flex">
            <ShieldCheck size={13} strokeWidth={2.4} />
            100% real data
          </span>
          <button
            onClick={onOpenNewsletter}
            title="Open the monthly newsletter"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-slate-700 sm:px-3"
          >
            <Newspaper size={14} strokeWidth={2.4} />
            <span className="hidden sm:inline">Newsletter</span>
            <span className="sm:hidden">News</span>
          </button>
          <div className="hidden text-right sm:block">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">as of</div>
            <div className="tnum text-[11.5px] font-semibold leading-tight text-slate-600">
              {whenLabel(generatedAt)}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
