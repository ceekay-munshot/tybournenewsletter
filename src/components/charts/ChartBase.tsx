import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Measure a container's width (responsive SVG without a chart library). */
export function useElementWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && Math.abs(w - width) > 0.5) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || fallback);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, width };
}

export interface TipRow {
  label: string;
  value: string;
  color?: string;
}
export interface TipContent {
  title: string;
  color?: string;
  rows: TipRow[];
  note?: string;
}
export interface TipState {
  x: number;
  y: number;
  content: TipContent;
}

export function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback((x: number, y: number, content: TipContent) => setTip({ x, y, content }), []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

/** Styled, colourful hover tooltip positioned inside a relative chart frame. */
export function ChartTooltip({ tip, frameWidth }: { tip: TipState | null; frameWidth: number }) {
  if (!tip) return null;
  const TIP_W = 236;
  let left = tip.x + 14;
  if (left + TIP_W > frameWidth) left = tip.x - TIP_W - 14;
  if (left < 4) left = 4;
  const top = Math.max(4, tip.y - 12);
  return (
    <div className="pointer-events-none absolute z-30 anim-fade" style={{ left, top, width: TIP_W }}>
      <div className="overflow-hidden rounded-xl border border-black/5 bg-white/95 shadow-pop backdrop-blur-sm">
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ background: tip.content.color ?? '#6366F1' }}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-white/90" />
          <span className="truncate text-[12.5px] font-semibold leading-tight text-white font-display">
            {tip.content.title}
          </span>
        </div>
        <div className="px-3 py-2">
          {tip.content.rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-0.5 text-[12px]">
              <span className="flex items-center gap-1.5 text-slate-500">
                {r.color && <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />}
                {r.label}
              </span>
              <span className="tnum font-semibold text-slate-900">{r.value}</span>
            </div>
          ))}
          {tip.content.note && (
            <p className="mt-1.5 border-t border-dashed border-black/10 pt-1.5 text-[11px] italic leading-snug text-slate-500">
              {tip.content.note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  value?: string;
}
export function Legend({ items, className = '' }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          <span>{it.label}</span>
          {it.value && <span className="tnum font-semibold text-slate-900">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

/** Relative frame that hosts an SVG chart + its tooltip overlay. */
export function ChartFrame({
  innerRef,
  children,
  tip,
  width,
  className = '',
}: {
  innerRef: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
  tip: TipState | null;
  width: number;
  className?: string;
}) {
  return (
    <div ref={innerRef} className={`relative w-full min-w-0 ${className}`}>
      {children}
      <ChartTooltip tip={tip} frameWidth={width} />
    </div>
  );
}
