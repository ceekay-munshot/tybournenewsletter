import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { ClientInfo } from '../types';
import { whenLabel } from '../lib/format';

/** Munshot brand mark: uses /munshot-logo.png when present, else a crisp wordmark. */
function MunshotMark() {
  const [imgOk, setImgOk] = useState(true);
  const src = `${import.meta.env.BASE_URL}munshot-logo.png`;
  if (imgOk) {
    return (
      <img
        src={src}
        alt="Munshot"
        className="h-7 w-auto"
        onError={() => setImgOk(false)}
      />
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span
        className="grid h-7 w-7 place-items-center rounded-lg text-white shadow-sm"
        style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 55%, #EC4899 100%)' }}
        aria-hidden
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 11V4.2L7 8l5-3.8V11" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-display text-[17px] font-bold tracking-tight text-slate-900">Munshot</span>
    </span>
  );
}

export function Header({ client, generatedAt }: { client: ClientInfo; generatedAt: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <MunshotMark />
          <span className="hidden h-6 w-px bg-slate-200 sm:block" />
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-bold leading-tight text-slate-900 sm:text-base">
              {client.name}
            </div>
            <div className="truncate text-[11px] leading-tight text-slate-500">
              Consolidated quarterly intelligence
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-100 sm:inline-flex">
            <ShieldCheck size={13} strokeWidth={2.4} />
            100% real data
          </span>
          <div className="text-right">
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
