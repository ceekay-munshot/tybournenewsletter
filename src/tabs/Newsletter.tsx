import type { ReactNode } from 'react';
import { Download, ShieldCheck, Quote, Eye, Sparkles, KeyRound, TrendingUp, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ConsolidatedData, Newsletter, ChangeBlock, SectorDef } from '../types';
import type { NewsletterState } from '../lib/newsletter';
import { MoversChart } from '../components/MoversChart';
import { MunshotMark } from '../components/MunshotMark';
import { SECTOR_ICON, iconFor } from '../lib/icons';
import { sectorColor, directionColor, shade, withAlpha } from '../lib/brand';
import { headlineText, headlineMagnitude, fmtValue, signedPct, dateLabel } from '../lib/format';

const periodArrow = (b: ChangeBlock) => `${b.lastPeriodLabel} → ${b.thisPeriodLabel}`;

/** A plain, factual one-liner from the real figures — used when the AI editor is off.
 *  Never fabricated: just the numbers, both periods. */
function factualLine(b: ChangeBlock): string {
  if (b.highlights?.length) {
    const first = b.notes?.split('. ')[0];
    return first ? (first.endsWith('.') ? first : `${first}.`) : b.metricLabel;
  }
  const chg = headlineText(b.changePct, b.changeAbs, b.changeDisplay);
  const hasVals = b.lastValue != null && b.thisValue != null;
  const vals = hasVals ? ` (${fmtValue(b.lastValue, b.unit)} → ${fmtValue(b.thisValue, b.unit)})` : '';
  const verb = chg === '—' ? 'held flat' : chg;
  return `${b.metricLabel}: ${verb}${vals} · ${periodArrow(b)}.`;
}

/** The dominant reporting period across systems — used as an honest fallback title. */
function deriveQuarterLabel(data: ConsolidatedData): string {
  const counts = new Map<string, number>();
  for (const b of data.systems) {
    if (b.status === 'error') continue;
    counts.set(b.thisPeriodLabel, (counts.get(b.thisPeriodLabel) ?? 0) + 1);
  }
  let best = '';
  let max = 0;
  for (const [k, v] of counts) if (v > max) ((max = v), (best = k));
  return best ? `${best} — going into earnings` : 'Going into earnings';
}

// ---------------------------------------------------------------------------

export function NewsletterModal(props: {
  data: ConsolidatedData;
  newsletter: NewsletterState;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDownloadPdf: () => void;
}) {
  if (!props.open) return null;
  return (
    <div
      className="nl-modal-overlay no-print fixed inset-0 z-50 overflow-y-auto bg-slate-900/55 p-3 backdrop-blur-sm sm:p-6"
      onClick={props.onClose}
    >
      <div
        className="nl-modal-panel relative mx-auto w-full max-w-4xl rounded-2xl bg-white p-5 shadow-pop ring-1 ring-slate-200 sm:my-2 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={props.onClose}
          aria-label="Close newsletter"
          className="no-print absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
        >
          <X size={16} strokeWidth={2.4} />
        </button>
        <NewsletterArticle
          data={props.data}
          newsletter={props.newsletter}
          onSelect={props.onSelect}
          onDownloadPdf={props.onDownloadPdf}
        />
      </div>
    </div>
  );
}

function NewsletterArticle({
  data,
  newsletter,
  onSelect,
  onDownloadPdf,
}: {
  data: ConsolidatedData;
  newsletter: NewsletterState;
  onSelect: (id: string) => void;
  onDownloadPdf: () => void;
}) {
  const nl: Newsletter | null = newsletter.status === 'ready' ? newsletter.data : null;
  const aiOk = nl?.status === 'ok';

  const quarterLabel = (aiOk && nl?.quarterLabel) || deriveQuarterLabel(data);

  // AI line + sector-summary lookups (empty unless status 'ok')
  const aiLine = new Map<string, string>();
  const aiSectorSummary = new Map<string, string>();
  if (aiOk && nl) {
    for (const s of nl.bySector) {
      if (s.summary) aiSectorSummary.set(String(s.sector), s.summary);
      for (const sys of s.systems || []) if (sys.line) aiLine.set(sys.systemId, sys.line);
    }
  }

  // "By the numbers" — the biggest plottable movers (real data), largest first.
  const topMovers = data.systems
    .filter((b) => b.status !== 'error')
    .map((b) => ({ b, mag: headlineMagnitude(b.changePct, b.changeAbs, b.changeDisplay) }))
    .filter((x) => x.mag != null)
    .sort((a, b) => Math.abs(b.mag as number) - Math.abs(a.mag as number))
    .slice(0, 5)
    .map((x) => x.b);

  const sources = [...new Set(data.systems.map((s) => s.sourceName).filter(Boolean))];

  return (
    <article className="nl-root animate-fade-in">
      <Masthead client={data.client} quarterLabel={quarterLabel} generatedAt={data.generatedAt} onDownloadPdf={onDownloadPdf} />

      {!aiOk && <EditorNote state={newsletter} />}
      {aiOk && nl && <AiStamp nl={nl} />}

      <ByTheNumbers movers={topMovers} />

      {/* Executive summary */}
      <section className="nl-section nl-avoid mt-7">
        <SectionLabel>Executive summary</SectionLabel>
        {aiOk && nl?.executiveSummary ? (
          <p className="nl-lede mt-2 text-[15px] leading-relaxed text-slate-700">{nl.executiveSummary}</p>
        ) : (
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            The AI editor writes the prose summary here. It is off in this build, so this edition shows the live,
            source-stamped figures only — <span className="font-semibold text-slate-700">nothing is written that the data doesn't say.</span>{' '}
            See the numbers below and in each sector.
          </p>
        )}
      </section>

      {/* What moved (chart) */}
      <section className="nl-section mt-7">
        <SectionLabel icon={TrendingUp}>What moved this quarter</SectionLabel>
        <p className="mt-1 text-[12.5px] text-slate-500">
          Headline change per system, largest first. Green = up, red = down. Mixed units — each bar is labelled.
        </p>
        <div className="mt-3">
          <MoversChart systems={data.systems} onSelect={onSelect} />
        </div>
      </section>

      {/* One section per sector */}
      {data.sectors.map((sector) => {
        const blocks = data.systems
          .filter((b) => b.sector === sector.id)
          .sort((a, b) => Math.abs(headlineMagnitude(b.changePct, b.changeAbs, b.changeDisplay) ?? -1) - Math.abs(headlineMagnitude(a.changePct, a.changeAbs, a.changeDisplay) ?? -1));
        if (!blocks.length) return null;
        return (
          <SectorBlock
            key={sector.id}
            sector={sector}
            blocks={blocks}
            summary={aiSectorSummary.get(sector.id)}
            aiLine={aiLine}
            onSelect={onSelect}
          />
        );
      })}

      <WatchList items={aiOk ? nl?.watchList ?? [] : []} enabled={aiOk} />

      <SourcesBox sources={sources} methodNote={aiOk ? nl?.methodNote : null} publishedBy={data.client.publishedBy} />
    </article>
  );
}

// ---------------------------------------------------------------------------

function Masthead({
  client,
  quarterLabel,
  generatedAt,
  onDownloadPdf,
}: {
  client: ConsolidatedData['client'];
  quarterLabel: string;
  generatedAt: string;
  onDownloadPdf: () => void;
}) {
  return (
    <header className="nl-masthead relative">
      <div className="flex items-center justify-between gap-3">
        <MunshotMark size="sm" />
        <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:inline">
          Quarterly intelligence edition
        </span>
        <button
          onClick={onDownloadPdf}
          className="no-print inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-slate-700"
        >
          <Download size={14} strokeWidth={2.4} /> Download PDF
        </button>
      </div>

      <div className="mt-5 border-y-2 border-slate-900 py-5 text-center">
        <h1 className="nl-title font-display text-[34px] font-bold uppercase leading-none tracking-[0.04em] text-slate-900 sm:text-[46px]">
          {client.shortName} Intelligence
        </h1>
        <p className="mt-2.5 text-[13.5px] font-medium text-slate-500">{quarterLabel}</p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11.5px] text-slate-400">
        <span className="tnum">{dateLabel(generatedAt)}</span>
        <span className="text-slate-300">·</span>
        <span>Published by <span className="font-semibold text-slate-600">{client.publishedBy}</span></span>
        <span className="text-slate-300">·</span>
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
          <ShieldCheck size={12} strokeWidth={2.4} /> 100% real data
        </span>
      </div>
    </header>
  );
}

function AiStamp({ nl }: { nl: Newsletter }) {
  return (
    <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-600 ring-1 ring-indigo-100">
      <Sparkles size={12} strokeWidth={2.4} />
      AI edition · written by {nl.model?.split('.').pop()?.replace(/[:-]v?\d.*$/, '') || nl.provider || 'Bedrock'} from the real figures
    </div>
  );
}

function EditorNote({ state }: { state: NewsletterState }) {
  const reason =
    state.status === 'ready' && state.data.status === 'no-key'
      ? 'The AI editor (Amazon Bedrock) is not configured, so the prose summary and watch list are off.'
      : state.status === 'ready' && state.data.status === 'error'
        ? 'The AI editor hit an error this run, so the prose summary and watch list are off.'
        : 'The AI editor has not produced an edition yet.';
  return (
    <div className="no-print mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800 ring-1 ring-amber-100">
      <KeyRound size={15} className="mt-0.5 shrink-0" strokeWidth={2.2} />
      <span className="leading-snug">
        {reason} The figures in this edition are live and source-stamped — <span className="font-semibold">no prose is invented</span>.
      </span>
    </div>
  );
}

function SectionLabel({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <h2 className="flex items-center gap-2 border-b border-slate-200 pb-1.5 font-display text-[13px] font-bold uppercase tracking-[0.1em] text-slate-900">
      {Icon && <Icon size={15} strokeWidth={2.4} className="text-slate-400" />}
      {children}
    </h2>
  );
}

function ByTheNumbers({ movers }: { movers: ChangeBlock[] }) {
  if (!movers.length) return null;
  return (
    <section className="nl-section nl-avoid mt-6">
      <SectionLabel>By the numbers</SectionLabel>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {movers.map((b) => {
          const c = directionColor(b.direction);
          return (
            <div key={b.systemId} className="nl-avoid rounded-xl bg-white p-3 text-center ring-1 ring-slate-200/70" style={{ boxShadow: `inset 0 -3px 0 0 ${withAlpha(c, 0.5)}` }}>
              <div className="tnum font-display text-[22px] font-bold leading-none" style={{ color: c }}>
                {headlineText(b.changePct, b.changeAbs, b.changeDisplay)}
              </div>
              <div className="mt-1.5 line-clamp-2 text-[11.5px] font-semibold leading-tight text-slate-700">{b.name}</div>
              <div className="tnum mt-1 text-[10px] text-slate-400">{periodArrow(b)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectorBlock({
  sector,
  blocks,
  summary,
  aiLine,
  onSelect,
}: {
  sector: SectorDef;
  blocks: ChangeBlock[];
  summary?: string;
  aiLine: Map<string, string>;
  onSelect: (id: string) => void;
}) {
  const Icon = SECTOR_ICON[sector.id];
  return (
    <section className="nl-section mt-7">
      <div
        className="nl-avoid mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2"
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
        <span className="tnum rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white" style={{ background: sector.color }}>
          {blocks.length}
        </span>
      </div>

      {summary && <p className="nl-lede mb-3 text-[13.5px] italic leading-relaxed text-slate-600">{summary}</p>}

      <div className="flex flex-col gap-2.5">
        {blocks.map((b) => (
          <SystemDetail key={b.systemId} b={b} line={aiLine.get(b.systemId)} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

/** A full, document-style entry per system: headline, the narrative line, the COMPLETE
 *  breakdown table, any secondary metrics, and the honest caveat. The newsletter is the
 *  detailed record — the dashboard is the glance. */
function SystemDetail({ b, line, onSelect }: { b: ChangeBlock; line?: string; onSelect: (id: string) => void }) {
  const Icon = iconFor(b.systemId, b.sector);
  const accent = sectorColor(b.sector);
  const c = directionColor(b.direction);
  const narrative = !!b.highlights?.length;
  const body = line || factualLine(b);
  const rows = b.breakdown || [];

  return (
    <div className="nl-avoid rounded-xl bg-white p-3.5 ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => onSelect(b.systemId)} className="flex min-w-0 items-center gap-2 text-left">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${accent}14`, color: accent }}>
            <Icon size={15} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-[14px] font-bold leading-tight text-slate-900">{b.name}</div>
            <div className="tnum text-[10.5px] text-slate-400">{b.metricLabel} · {periodArrow(b)}</div>
          </div>
        </button>
        {narrative ? (
          <span className="tnum shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: `${accent}14`, color: accent }}>
            {b.thisValue != null ? fmtValue(b.thisValue, b.unit) : 'themes'}
          </span>
        ) : (
          <div className="shrink-0 text-right">
            <div className="tnum font-display text-[19px] font-bold leading-none" style={{ color: c }}>
              {headlineText(b.changePct, b.changeAbs, b.changeDisplay)}
            </div>
            {b.lastValue != null && (
              <div className="tnum mt-0.5 text-[10.5px] text-slate-400">
                {fmtValue(b.lastValue, b.unit)} → {fmtValue(b.thisValue, b.unit)}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[12.5px] leading-snug text-slate-600">{body}</p>

      {narrative && b.highlights ? (
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {b.highlights.map((h, i) => (
            <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-slate-600">
              <Quote size={11} className="mt-[3px] shrink-0" style={{ color: accent }} />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      ) : rows.length > 0 ? (
        <div className="mt-2.5 overflow-hidden rounded-lg ring-1 ring-slate-200/70">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="px-2.5 py-1.5 font-semibold">Breakdown</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">{b.lastPeriodLabel}</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">{b.thisPeriodLabel}</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={i % 2 ? 'bg-white' : 'bg-slate-50/40'}>
                  <td className="px-2.5 py-1.5 font-medium text-slate-700">{r.label}</td>
                  <td className="tnum px-2.5 py-1.5 text-right text-slate-500">{fmtValue(r.lastValue, b.unit)}</td>
                  <td className="tnum px-2.5 py-1.5 text-right font-semibold text-slate-800">{fmtValue(r.thisValue, b.unit)}</td>
                  <td className="tnum px-2.5 py-1.5 text-right font-bold" style={{ color: directionColor(r.direction) }}>
                    {signedPct(r.changePct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {b.secondaryMetrics && b.secondaryMetrics.length > 0 && (
        <div className="mt-2.5 border-t border-dashed border-slate-200 pt-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Also moved</div>
          <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {b.secondaryMetrics.map((m) => (
              <div key={m.metricLabel} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-slate-600">{m.metricLabel}</span>
                <span className="tnum shrink-0 font-semibold" style={{ color: directionColor(m.direction) }}>
                  {headlineText(m.changePct, m.changeAbs, m.changeDisplay)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {b.notes && <p className="mt-2 text-[11px] italic leading-snug text-slate-400">{b.notes}</p>}
    </div>
  );
}

function WatchList({ items, enabled }: { items: string[]; enabled: boolean }) {
  return (
    <section className="nl-section nl-avoid mt-7">
      <SectionLabel icon={Eye}>Watch list</SectionLabel>
      {items.length ? (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((w, i) => (
            <li key={i} className="flex gap-2 rounded-xl bg-white p-3 text-[13px] leading-snug text-slate-700 ring-1 ring-slate-200/70">
              <span className="tnum mt-0.5 shrink-0 font-display text-[12px] font-bold text-indigo-500">{String(i + 1).padStart(2, '0')}</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          {enabled
            ? 'No forward-looking items this quarter.'
            : 'The forward-looking watch list is written by the AI editor. Add a Bedrock key to enable it — the numbers above stay real either way.'}
        </p>
      )}
    </section>
  );
}

function SourcesBox({ sources, methodNote, publishedBy }: { sources: string[]; methodNote?: string | null; publishedBy: string }) {
  return (
    <section className="nl-section nl-avoid mt-8 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70 sm:p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-emerald-600" strokeWidth={2.4} />
        <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.1em] text-slate-900">Sources · nothing fabricated</h2>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
        {methodNote ||
          'Every figure in this edition is pulled live from the sources below and stamped with both compared periods. We never estimate, round differently, or fill gaps — a system with no clean data is marked, not guessed.'}
      </p>
      {sources.length > 0 && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-500">Sources:</span> {sources.join(' · ')}
        </p>
      )}
      <p className="mt-3 border-t border-slate-200 pt-3 text-[11.5px] text-slate-400">
        Published by <span className="font-semibold text-slate-600">{publishedBy}</span>.
      </p>
    </section>
  );
}
