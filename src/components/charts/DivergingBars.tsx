import { useElementWidth, useTip, ChartFrame, type TipRow } from './ChartBase';
import { niceTicks } from '../../lib/chartMath';
import { shade } from '../../lib/brand';

export interface DivergingDatum {
  key: string;
  label: string;
  value: number; // signed
  color: string;
  valueLabel: string; // text drawn at the bar end, e.g. "+15.7%"
  sublabel?: string;
  tipTitle?: string;
  tipColor?: string;
  tipRows?: TipRow[];
  tipNote?: string;
  faded?: boolean;
}

interface Props {
  data: DivergingDatum[];
  axisFormat: (n: number) => string; // for the ± axis labels
  barSize?: number;
  labelWidth?: number;
  domain?: number; // max |value| the axis spans; bars beyond are clamped (label still true)
  onClick?: (key: string) => void;
}

/** Zero-centred horizontal bars: positive right, negative left. Honest about tiny
 *  moves (numeric label always drawn) and about huge ones (bar clamps to the axis
 *  cap while the label keeps the true value). */
export function DivergingBars({ data, axisFormat, barSize = 26, labelWidth = 170, domain, onClick }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();

  const rowGap = 14;
  const rowH = barSize + rowGap;
  const padTop = 8;
  const axisH = 26;
  const chartH = data.length * rowH + padTop + axisH;

  const plotLeft = labelWidth + 10;
  const plotRight = width - 14;
  const plotW = Math.max(60, plotRight - plotLeft);
  const zeroX = plotLeft + plotW / 2;

  const rawMax = domain ?? Math.max(1e-9, ...data.map((d) => Math.abs(d.value)));
  const { niceMax } = niceTicks(rawMax, 2);
  const dom = niceMax || rawMax;
  const half = plotW / 2;
  const xOf = (v: number) => zeroX + (v / dom) * half;
  const clampX = (x: number) => Math.max(plotLeft, Math.min(plotRight, x));
  const axisTicks = [-dom, -dom / 2, 0, dom / 2, dom];

  const uniqueColors = [...new Set(data.map((d) => d.color))];
  const gid = (c: string) => `dg-${c.replace('#', '')}`;

  const moveTip = (e: React.MouseEvent, d: DivergingDatum, cy: number) => {
    const rect = ref.current?.getBoundingClientRect();
    const px = rect ? e.clientX - rect.left : zeroX;
    show(px, cy, {
      title: d.tipTitle ?? d.label,
      color: d.tipColor ?? d.color,
      rows: d.tipRows ?? [{ label: 'Change', value: d.valueLabel }],
      note: d.tipNote,
    });
  };

  return (
    <ChartFrame innerRef={ref} tip={tip} width={width}>
      <svg width={width} height={chartH} role="img" className="overflow-visible">
        <defs>
          {uniqueColors.map((c) => (
            <linearGradient key={c} id={gid(c)} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={shade(c, 0.22)} />
              <stop offset="100%" stopColor={c} />
            </linearGradient>
          ))}
        </defs>
        {axisTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={xOf(t)}
              x2={xOf(t)}
              y1={padTop}
              y2={padTop + data.length * rowH}
              stroke={t === 0 ? '#CBD5E1' : '#EEF2F7'}
              strokeWidth={t === 0 ? 1.5 : 1}
            />
            <text x={xOf(t)} y={padTop + data.length * rowH + 16} textAnchor="middle" className="tnum" fontSize={10} fill="#94A3B8">
              {t === 0 ? '0' : axisFormat(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const y = padTop + i * rowH;
          const cy = y + barSize / 2;
          const end = clampX(xOf(d.value));
          const left = Math.min(zeroX, end);
          const w = Math.max(2, Math.abs(end - zeroX));
          const positive = d.value >= 0;
          const clamped = xOf(d.value) !== end;
          const outsideX = positive ? end + 7 : end - 7;
          const approxW = d.valueLabel.length * 6.5;
          const overflow = clamped || (positive ? outsideX + approxW > plotRight : outsideX - approxW < plotLeft);
          const labelX = overflow ? (positive ? end - 7 : end + 7) : outsideX;
          const labelAnchor: 'start' | 'end' = overflow ? (positive ? 'end' : 'start') : positive ? 'start' : 'end';
          const labelFill = overflow ? '#ffffff' : '#334155';

          return (
            <g
              key={d.key}
              opacity={d.faded ? 0.6 : 1}
              style={{ cursor: onClick ? 'pointer' : 'default' }}
              onMouseMove={(e) => moveTip(e, d, cy)}
              onMouseLeave={hide}
              onClick={() => onClick?.(d.key)}
            >
              <text x={0} y={cy - 1} fontSize={12.5} fill="#334155" fontWeight={600}>
                <title>{d.label}</title>
                {truncate(d.label, labelWidth, 12.5)}
              </text>
              {d.sublabel && (
                <text x={0} y={cy + 12} fontSize={9.5} fill="#94A3B8">
                  {truncate(d.sublabel, labelWidth, 9.5)}
                </text>
              )}
              <rect className="anim-fade" style={{ animationDelay: `${i * 45}ms` }} x={left} y={y} width={w} height={barSize} rx={5} fill={`url(#${gid(d.color)})`} />
              {clamped && (
                <path
                  d={positive ? `M ${end - 1} ${cy - 4} l 5 4 l -5 4` : `M ${end + 1} ${cy - 4} l -5 4 l 5 4`}
                  fill="#ffffff"
                  opacity={0.9}
                />
              )}
              <text x={labelX} y={cy + 4} textAnchor={labelAnchor} className="tnum" fontSize={11.5} fontWeight={700} fill={labelFill}>
                {d.valueLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}

function truncate(s: string, widthPx: number, fontSize: number): string {
  const maxChars = Math.floor((widthPx - 8) / (fontSize * 0.6));
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + '…';
}
