import type { ConsolidatedData } from '../types';

export function Footer({ data }: { data: ConsolidatedData }) {
  const sources = [...new Set(data.systems.map((s) => s.sourceName).filter(Boolean))];
  return (
    <footer className="no-print mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">
      <div className="border-t border-slate-200 pt-4 text-[11.5px] leading-relaxed text-slate-500">
        <p>
          Published by <span className="font-semibold text-slate-700">{data.client.publishedBy}</span> ·{' '}
          <span className="font-semibold text-slate-700">100% real data</span>, every figure source-stamped.
        </p>
        {sources.length > 0 && (
          <p className="mt-1 text-slate-400">
            Sources: {sources.join(' · ')}
          </p>
        )}
      </div>
    </footer>
  );
}
