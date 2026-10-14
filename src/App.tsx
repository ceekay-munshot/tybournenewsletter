import { useState } from 'react';
import { LayoutGrid, Newspaper, AlertTriangle } from 'lucide-react';
import { useConsolidated, systemById } from './lib/data';
import { useNewsletter } from './lib/newsletter';
import type { SectorId } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Tabs, type TabDef } from './components/ui/Tabs';
import { SECTOR_ICON } from './lib/icons';
import { Overview } from './tabs/Overview';
import { NewsletterTab } from './tabs/Newsletter';
import { SectorTab } from './tabs/SectorTab';
import { SystemView } from './tabs/SystemView';

type TabKey = 'overview' | 'newsletter' | SectorId;

/** Deep-link support: /?edition=newsletter (or #newsletter) opens the Newsletter tab.
 *  Used by the quarterly email render and for shareable links. */
function initialTab(): TabKey {
  if (typeof window === 'undefined') return 'overview';
  const q = new URLSearchParams(window.location.search).get('edition') ?? '';
  const v = (q || window.location.hash.replace('#', '')).toLowerCase();
  return v === 'newsletter' ? 'newsletter' : 'overview';
}

export default function App() {
  const state = useConsolidated();
  const newsletter = useNewsletter();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [systemId, setSystemId] = useState<string | null>(null);

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') return <ErrorScreen message={state.error} />;

  const data = state.data;

  const tabs: TabDef<TabKey>[] = [
    { key: 'overview', label: 'Overview', icon: LayoutGrid, color: '#6366F1' },
    { key: 'newsletter', label: 'Newsletter', icon: Newspaper, color: '#8B5CF6' },
    ...data.sectors.map((s) => ({
      key: s.id as TabKey,
      label: s.label,
      icon: SECTOR_ICON[s.id],
      color: s.color,
      badge: String(data.systems.filter((x) => x.sector === s.id).length),
    })),
  ];

  const activeTabLabel = tabs.find((t) => t.key === tab)?.label ?? 'Overview';
  const selected = systemId ? systemById(data, systemId) : undefined;

  const openSystem = (id: string) => {
    setSystemId(id);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const changeTab = (t: TabKey) => {
    setSystemId(null);
    setTab(t);
  };

  // Download PDF: jump to the (print-friendly) Newsletter, then open the browser's
  // print dialog. The print stylesheet renders only the newsletter article.
  const downloadPdf = () => {
    setSystemId(null);
    setTab('newsletter');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0 });
      window.setTimeout(() => window.print(), 180);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header client={data.client} generatedAt={data.generatedAt} onDownloadPdf={downloadPdf} />

      <div className="no-print sticky top-[53px] z-30 border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Tabs tabs={tabs} active={tab} onChange={changeTab} />
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">
        {selected ? (
          <SystemView block={selected} onBack={() => setSystemId(null)} backLabel={activeTabLabel} />
        ) : tab === 'overview' ? (
          <Overview data={data} onSelect={openSystem} />
        ) : tab === 'newsletter' ? (
          <NewsletterTab data={data} newsletter={newsletter} onSelect={openSystem} onDownloadPdf={downloadPdf} />
        ) : (
          <SectorTab data={data} sector={data.sectors.find((s) => s.id === tab)!} onSelect={openSystem} />
        )}
      </main>

      <Footer data={data} />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="shimmer h-7 w-40" />
          <div className="shimmer h-7 w-28" />
        </div>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="shimmer mb-4 h-8 w-80 max-w-full" />
        <div className="shimmer mb-6 h-56 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shimmer h-44 w-full rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-card ring-1 ring-slate-200/70">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-rose-50 text-rose-500">
          <AlertTriangle size={20} />
        </div>
        <h1 className="font-display text-lg font-bold text-slate-900">Couldn't load the dashboard</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">{message}</p>
        <p className="mt-3 text-[12px] text-slate-400">
          The data file is generated by the refresh pipeline. If this persists, the latest run may not have completed.
        </p>
      </div>
    </div>
  );
}
