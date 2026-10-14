import { useElementWidth, useTip, ChartFrame, type TipRow } from './ChartBase';
import { niceTicks, linScale } from '../../lib/chartMath';

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  valueLabel?: string;
  sublabel?: string;
  note?: string;
  tipRows?: TipRow[];
  tipTitle?: string;
  faded?: boolean;
}

interface Props {
  data: HBarDatum[];
  format: (n: number) => string;
  barSize?: number;
  labelWidth?: number;
  maxValue?: number;
  axisTicks?: number;
  showAxis?: boolean;
  onClick?: (d: HBarDatum) => void;
}

/** Single-direction horizontal bars (for non-negative magnitudes). */
export function HBars({
  data,
  format,
  barSize = 24,
  labelWidth = 150,
  maxValue,
  axisTicks = 4,
  showAxis = true,
  onClick,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();

  const rowGap = 12;
  const rowH = barSize + rowGap;
  const padTop = 6;
  const axisH = showAxis ? 26 : 6;
  const chartH = data.length * rowH + padTop + axisH;

  const plotLeft = labelWidth + 10;
  const plotRight = width - 16;
  const plotW = Math.max(40, plotRight - plotLeft);

  const rawMax = maxValue ?? Math.max(1, ...data.map((d) => d.value));
  const { ticks, niceMax } = niceTicks(rawMax, axisTicks);
  const x = linScale(0, niceMax, plotLeft, plotLeft + plotW);

  const moveTip = (e: React.MouseEvent, d: HBarDatum, cy: number) => {
    const rect = ref.current?.getBoundingClientRect();
    const px = rect ? e.clientX - rect.left : plotLeft;
    show(px, cy, {
      title: d.tipTitle ?? d.label,
      color: d.color,
      rows: d.tipRows ?? [{ label: d.sublabel ?? 'Value', value: d.valueLabel ?? format(d.value) }],
      note: d.note,
    });
  };

  return (
    <ChartFrame innerRef={ref} tip={tip} width={width}>
      <svg width={width} height={chartH} role="img" className="overflow-visible">
        {showAxis &&
          ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={padTop}
                y2={padTop + data.length * rowH}
                stroke={i === 0 ? '#CBD5E1' : '#EEF2F7'}
                strokeWidth={1}
              />
              <text
                x={x(t)}
                y={padTop + data.length * rowH + 16}
                textAnchor="middle"
                className="tnum"
                fontSize={10.5}
                fill="#94A3B8"
              >
                {format(t)}
              </text>
            </g>
          ))}

        {data.map((d, i) => {
          const y = padTop + i * rowH;
          const cy = y + barSize / 2;
          const barW = Math.max(2, x(d.value) - plotLeft);
          const valueText = d.valueLabel ?? format(d.value);
          const insideLabel = barW > 56;
          return (
            <g
              key={d.key}
              opacity={d.faded ? 0.55 : 1}
              style={{ cursor: onClick ? 'pointer' : 'default' }}
              onMouseMove={(e) => moveTip(e, d, cy)}
              onMouseLeave={hide}
              onClick={() => onClick?.(d)}
            >
              <text x={0} y={cy - 2} fontSize={12} fill="#334155" fontWeight={500}>
                <title>{d.label}</title>
                {truncate(d.label, labelWidth, 12)}
              </text>
              {d.sublabel && (
                <text x={0} y={cy + 11} fontSize={9.5} fill="#94A3B8">
                  {truncate(d.sublabel, labelWidth, 9.5)}
                </text>
              )}
              <rect x={plotLeft} y={y} width={plotW} height={barSize} rx={5} fill="#F1F5F9" />
              <rect
                className="anim-bar-h"
                style={{ animationDelay: `${i * 55}ms` }}
                x={plotLeft}
                y={y}
                width={barW}
                height={barSize}
                rx={5}
                fill={d.color}
              />
              <text
                x={insideLabel ? plotLeft + barW - 8 : plotLeft + barW + 6}
                y={cy + 4}
                textAnchor={insideLabel ? 'end' : 'start'}
                className="tnum"
                fontSize={11.5}
                fontWeight={700}
                fill={insideLabel ? '#fff' : '#334155'}
              >
                {valueText}
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
