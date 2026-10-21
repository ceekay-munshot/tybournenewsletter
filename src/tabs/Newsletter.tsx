import type { ReactNode } from 'react';
import { Download, ShieldCheck, Quote, Eye, Sparkles, KeyRound, TrendingUp, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ConsolidatedData, Newsletter, ChangeBlock, AuxTable } from '../types';
import type { NewsletterState } from '../lib/newsletter';
import { MoversChart } from '../components/MoversChart';
import { MunshotMark } from '../components/MunshotMark';
import { BreakdownRows, SeriesRows } from '../components/MultiPeriodView';
import { iconFor } from '../lib/icons';
import { sectorColor, directionColor, withAlpha } from '../lib/brand';
import { headlineText, headlineMagnitude, fmtValue, dateLabel } from '../lib/format';

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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Honest fallback edition title from the build date, e.g. "October 2026 — monthly intelligence". */
function deriveEditionLabel(data: ConsolidatedData): string {
  const d = new Date(data.generatedAt);
  if (Number.isNaN(d.getTime())) return 'Monthly intelligence edition';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} — monthly intelligence`;
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

  const editionLabel = (aiOk && nl?.editionLabel) || deriveEditionLabel(data);

  // AI per-dashboard line lookup (empty unless status 'ok')
  const aiLine = new Map<string, string>();
  if (aiOk && nl) for (const s of nl.lines || []) if (s.line) aiLine.set(s.systemId, s.line);

  // All dashboards, ranked by headline magnitude (largest move first). Narrative
  // dashboards with no plottable headline (e.g. podcast themes) fall to the end.
  const ranked = data.systems
    .filter((b) => b.status !== 'error')
    .map((b) => ({ b, mag: Math.abs(headlineMagnitude(b.changePct, b.changeAbs, b.changeDisplay) ?? -1) }))
    .sort((a, b) => b.mag - a.mag)
    .map((x) => x.b);

  // "By the numbers" — the biggest plottable movers, largest first.
  const topMovers = ranked
    .filter((b) => headlineMagnitude(b.changePct, b.changeAbs, b.changeDisplay) != null)
    .slice(0, 5);

  const sources = [...new Set(data.systems.map((s) => s.sourceName).filter(Boolean))];

  return (
    <article className="nl-root animate-fade-in">
      <Masthead client={data.client} editionLabel={editionLabel} generatedAt={data.generatedAt} onDownloadPdf={onDownloadPdf} />

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
            See the numbers below and in each dashboard.
          </p>
        )}
      </section>

      {/* What moved (chart) */}
      <section className="nl-section mt-7">
        <SectionLabel icon={TrendingUp}>What moved</SectionLabel>
        <p className="mt-1 text-[12.5px] text-slate-500">
          Headline change per dashboard, largest first. Green = up, red = down. Mixed units and windows — each bar is labelled.
        </p>
        <div className="mt-3">
          <MoversChart systems={data.systems} onSelect={onSelect} />
        </div>
      </section>

      {/* One detailed entry per dashboard, ranked by move size */}
      <section className="nl-section mt-7">
        <SectionLabel>Dashboard by dashboard</SectionLabel>
        <p className="mt-1 text-[12.5px] text-slate-500">
          Every dashboard, biggest move first: the headline, what changed underneath, and why.
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {ranked.map((b) => (
            <SystemDetail key={b.systemId} b={b} line={aiLine.get(b.systemId)} onSelect={onSelect} />
          ))}
        </div>
      </section>

      <WatchList items={aiOk ? nl?.watchList ?? [] : []} enabled={aiOk} />

      <SourcesBox sources={sources} methodNote={aiOk ? nl?.methodNote : null} publishedBy={data.client.publishedBy} />
    </article>
  );
}

// ---------------------------------------------------------------------------

function Masthead({
  client,
  editionLabel,
  generatedAt,
  onDownloadPdf,
}: {
  client: ConsolidatedData['client'];
  editionLabel: string;
  generatedAt: string;
  onDownloadPdf: () => void;
}) {
  return (
    <header className="nl-masthead relative">
      <div className="flex items-center justify-between gap-3">
        <MunshotMark size="sm" />
        <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:inline">
          Monthly intelligence edition
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
        <p className="mt-2.5 text-[13.5px] font-medium text-slate-500">{editionLabel}</p>
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

/** A full, document-style entry per dashboard: headline, the narrative line, the COMPLETE
 *  breakdown table, the lifted "why it moved" insights, and the honest caveat. The
 *  newsletter is the detailed record — the dashboard is the glance. */
function SystemDetail({ b, line, onSelect }: { b: ChangeBlock; line?: string; onSelect: (id: string) => void }) {
  const Icon = iconFor(b.systemId, b.sector);
  const accent = sectorColor(b.sector);
  const c = directionColor(b.direction);
  const narrative = !!b.highlights?.length;
  // Narrative blocks (podcast) lead straight into the theme comparison — no consolidated-note
  // paragraph, matching the dashboard (the founder flagged that note as a duplicate). Only an
  // AI editor one-liner, if present, introduces them.
  const body = narrative ? line ?? '' : line || b.summary || factualLine(b);
  const rows = b.breakdown || [];
  const hasVals = rows.some(
    (r) => r.lastValue != null || r.thisValue != null || (r.sub ?? []).some((s) => s.lastValue != null || s.thisValue != null)
  );
  const insights = b.insights ?? [];
  const bNoun = b.breakdownNoun ?? 'breakdown';
  // two-period trend columns (prior value + prior change), adaptive like the dashboard table
  const showPrevVal =
    hasVals && (b.prevValue != null || rows.some((r) => r.prevValue != null || (r.sub ?? []).some((s) => s.prevValue != null)));
  const showPrevChg =
    b.prevChangePct != null ||
    b.prevChangeAbs != null ||
    rows.some(
      (r) =>
        r.prevChangePct != null ||
        r.prevChangeAbs != null ||
        (r.sub ?? []).some((s) => s.prevChangePct != null || s.prevChangeAbs != null)
    );
  const prevArrow = b.prevLabel ? `${b.prevLabel} → ${b.lastPeriodLabel}` : 'Prior';
  const thisArrow = `${b.lastPeriodLabel} → ${b.thisPeriodLabel}`;
  // Multi-period series (last N periods) — mirrors the dashboard table when present.
  const useSeries = Array.isArray(b.series) && b.series.length >= 2;
  const sLabels = useSeries ? b.series!.map((p) => p.label) : [];
  const seriesHasVals =
    useSeries && (b.series!.some((p) => p.value != null) || rows.some((r) => (r.series ?? []).some((p) => p.value != null)));

  return (
    <div className="nl-entry rounded-xl bg-white p-3.5 ring-1 ring-slate-200/70">
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
                {b.prevValue != null && <>{fmtValue(b.prevValue, b.unit)} → </>}
                {fmtValue(b.lastValue, b.unit)} → {fmtValue(b.thisValue, b.unit)}
              </div>
            )}
            {(b.prevChangePct != null || b.prevChangeAbs != null) && (
              <div className="tnum mt-0.5 text-[10px] text-slate-400">
                prior {prevArrow}:{' '}
                <span style={{ color: directionColor(b.prevDirection ?? 'flat') }}>
                  {headlineText(b.prevChangePct, b.prevChangeAbs, b.changeDisplay)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {body && <p className="mt-1.5 text-[12.5px] leading-snug text-slate-600">{body}</p>}

      {narrative && b.highlights ? (
        <div className="nl-avoid mt-2.5">
          {/* Recurring themes — last quarter vs this quarter, mirroring the dashboard. */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {b.prevHighlights && b.prevHighlights.length > 0 && (
              <NlThemeColumn label={b.lastPeriodLabel} count={b.lastValue} tone={b.prevTone} themes={b.prevHighlights} tint="#64748B" />
            )}
            <NlThemeColumn
              label={b.thisPeriodLabel}
              count={b.thisValue}
              tone={b.thisTone ?? b.tone}
              themes={b.highlights}
              newThemes={b.newHighlights}
              tint={accent}
              highlight
            />
          </div>
          {b.prevHighlights && b.prevHighlights.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-400">
              <span className="inline-block rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-100">
                new
              </span>
              = theme that appears this quarter but not last · {b.lastPeriodLabel} → {b.thisPeriodLabel}
            </p>
          )}
        </div>
      ) : rows.length > 0 || b.auxTables?.length || b.auxTableGroups?.length ? (
        <div className="mt-2.5 flex flex-col gap-2.5">
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200/70">
              <table className="w-full border-collapse text-[11.5px]">
                {useSeries ? (
                  <>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                        <th className="border-r border-slate-200 px-2.5 py-1.5 font-semibold capitalize last:border-r-0">{bNoun}</th>
                        {seriesHasVals &&
                          sLabels.map((l, i) => (
                            <th key={`v${i}`} className="whitespace-nowrap border-r border-slate-200 px-2.5 py-1.5 text-right font-semibold last:border-r-0">
                              {l}
                            </th>
                          ))}
                        {sLabels.slice(1).map((l, i) => (
                          <th
                            key={`c${i}`}
                            className="whitespace-nowrap border-r border-slate-200 px-2.5 py-1.5 text-right font-medium text-slate-400 last:border-r-0"
                          >
                            {sLabels[i]} → {l}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <SeriesRows key={r.label} row={r} unit={b.unit} disp={b.changeDisplay} hasVals={seriesHasVals} nPeriods={sLabels.length} />
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                        <th className="border-r border-slate-200 px-2.5 py-1.5 font-semibold capitalize last:border-r-0">{bNoun}</th>
                        {showPrevVal && <th className="border-r border-slate-200 px-2.5 py-1.5 text-right font-medium text-slate-400 last:border-r-0">{b.prevLabel}</th>}
                        {hasVals && <th className="border-r border-slate-200 px-2.5 py-1.5 text-right font-semibold last:border-r-0">{b.lastPeriodLabel}</th>}
                        {hasVals && <th className="border-r border-slate-200 px-2.5 py-1.5 text-right font-semibold last:border-r-0">{b.thisPeriodLabel}</th>}
                        {showPrevChg && <th className="whitespace-nowrap border-r border-slate-200 px-2.5 py-1.5 text-right font-medium text-slate-400 last:border-r-0">{prevArrow}</th>}
                        <th className="whitespace-nowrap border-r border-slate-200 px-2.5 py-1.5 text-right font-semibold last:border-r-0">{showPrevChg ? thisArrow : 'Change'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <BreakdownRows
                          key={r.label}
                          row={r}
                          unit={b.unit}
                          disp={b.changeDisplay}
                          hasVals={hasVals}
                          showPrevVal={showPrevVal}
                          showPrevChg={showPrevChg}
                        />
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
          {b.auxTables?.map((t, i) => (
            <NlAuxTable key={`t${i}`} table={t} />
          ))}
          {b.auxTableGroups?.map((g, gi) => (
            <div key={`g${gi}`} className="flex flex-col gap-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{g.label}</div>
              {g.tables.map((t, i) => (
                <NlAuxTable key={i} table={t} />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* Lifted "why it moved" — kept to SAP only, matching the dashboard (the founder
          asked for the narrative to come off everywhere else; tables carry the rest). */}
      {b.systemId === 'sap-ai' && insights.length > 0 && (
        <div className="mt-2.5 border-t border-dashed border-slate-200 pt-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Quote size={11} style={{ color: accent }} /> Why it moved
          </div>
          <div className="mt-1.5 flex flex-col gap-2">
            {insights.map((ins, i) => (
              <div key={i}>
                <div className="text-[12px] font-bold text-slate-800">{ins.title}</div>
                {ins.body && <p className="text-[11.5px] leading-snug text-slate-600">{ins.body}</p>}
                {ins.bullets && ins.bullets.length > 0 && (
                  <ul className="mt-0.5 flex flex-col gap-0.5">
                    {ins.bullets.map((bl, j) => (
                      <li key={j} className="flex gap-1.5 text-[11.5px] leading-snug text-slate-600">
                        <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: accent }} />
                        <span>{bl}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {b.notes && <p className="mt-2 text-[11px] italic leading-snug text-slate-400">{b.notes}</p>}
    </div>
  );
}

/** One quarter's column in the newsletter's podcast last-vs-this theme comparison —
 *  a compact mirror of the dashboard's ThemeColumn, with "new" tags for fresh themes. */
function NlThemeColumn({
  label,
  count,
  tone,
  themes,
  newThemes,
  tint,
  highlight = false,
}: {
  label: string;
  count: number | null;
  tone?: string;
  themes: string[];
  newThemes?: string[];
  tint: string;
  highlight?: boolean;
}) {
  const newSet = new Set((newThemes ?? []).map((t) => t.toLowerCase()));
  return (
    <div
      className="rounded-lg border p-2.5"
      style={{ borderColor: highlight ? `${tint}40` : '#E2E8F0', background: highlight ? `${tint}0A` : 'rgba(248,250,252,0.5)' }}
    >
      <div
        className="mb-1.5 flex items-baseline justify-between gap-2 border-b pb-1"
        style={{ borderColor: highlight ? `${tint}30` : '#E2E8F0' }}
      >
        <span className="font-display text-[12px] font-bold text-slate-900">{label}</span>
        <span className="tnum text-[10.5px] text-slate-500">
          {count != null ? `${count} episode${count === 1 ? '' : 's'}` : '—'}
          {tone ? ` · ${tone}` : ''}
        </span>
      </div>
      {themes.length ? (
        <ul className="flex flex-col gap-1">
          {themes.map((h, i) => {
            const isNew = newSet.has(h.toLowerCase());
            return (
              <li key={i} className="flex gap-1.5 text-[11.5px] leading-snug text-slate-700">
                <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full" style={{ background: tint }} />
                <span>
                  {h}
                  {isNew && (
                    <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-100">
                      new
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] italic text-slate-400">No themes captured this quarter.</p>
      )}
    </div>
  );
}

/** A connector-supplied supporting table (sector flows, entries/exits, accel vs decel,
 *  TI's UBS-compare / price matrices) rendered in the newsletter's tight bordered style —
 *  so the newsletter carries every table the dashboard shows behind its toggles. */
function NlAuxTable({ table }: { table: AuxTable }) {
  const alignOf = (i: number) => table.align?.[i] ?? (i === 0 ? 'left' : 'right');
  return (
    <div>
      <div className="text-[11px] font-bold text-slate-700">{table.title}</div>
      {table.subtitle && <div className="text-[10.5px] leading-snug text-slate-400">{table.subtitle}</div>}
      <div className="mt-1 overflow-x-auto rounded-lg ring-1 ring-slate-200/70">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              {table.headers.map((h, i) => (
                <th
                  key={i}
                  className={`whitespace-nowrap border-r border-slate-200 px-2.5 py-1.5 font-semibold last:border-r-0 ${alignOf(i) === 'right' ? 'text-right' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 ? 'bg-white' : 'bg-slate-50/40'}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`border-r border-slate-100 px-2.5 py-1.5 align-top last:border-r-0 ${
                      alignOf(ci) === 'right' ? 'tnum whitespace-nowrap text-right' : ''
                    } ${cell.bold ? 'font-semibold text-slate-800' : 'text-slate-600'}`}
                    style={cell.tone ? { color: directionColor(cell.tone) } : undefined}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={table.headers.length} className="px-2.5 py-4 text-center text-[11px] text-slate-400">
                  Nothing to show this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
