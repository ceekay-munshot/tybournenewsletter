import { useElementWidth, useTip, ChartFrame, type TipRow } from './ChartBase';
import { niceTicks, linScale } from '../../lib/chartMath';
import { shade } from '../../lib/brand';

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  valueLabel?: string;
  note?: string;
  tipRows?: TipRow[];
}

interface Props {
  data: ColumnDatum[];
  format: (n: number) => string;
  height?: number;
  maxValue?: number;
  axisTicks?: number;
  yAxisFormat?: (n: number) => string;
}

export function Columns({ data, format, height = 220, maxValue, axisTicks = 4, yAxisFormat }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();

  const padTop = 12;
  const axisH = 24;
  const yAxisW = 46;
  const plotH = height - padTop - axisH;
  const plotLeft = yAxisW;
  const plotRight = width - 10;
  const plotW = Math.max(40, plotRight - plotLeft);

  const rawMax = maxValue ?? Math.max(1, ...data.map((d) => d.value));
  const { ticks, niceMax } = niceTicks(rawMax, axisTicks);
  const y = linScale(0, niceMax, padTop + plotH, padTop);
  const fmtY = yAxisFormat ?? format;

  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.min(46, Math.max(8, slot * 0.6));

  const moveTip = (e: React.MouseEvent, d: ColumnDatum) => {
    const rect = ref.current?.getBoundingClientRect();
    show(rect ? e.clientX - rect.left : 0, rect ? e.clientY - rect.top : 0, {
      title: d.label,
      color: d.color,
      rows: d.tipRows ?? [{ label: 'Value', value: d.valueLabel ?? format(d.value) }],
      note: d.note,
    });
  };

  const uniqueColors = [...new Set(data.map((d) => d.color))];
  const gid = (c: string) => `col-${c.replace('#', '')}`;

  return (
    <ChartFrame innerRef={ref} tip={tip} width={width}>
      <svg width={width} height={height} role="img">
        <defs>
          {uniqueColors.map((c) => (
            <linearGradient key={c} id={gid(c)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={shade(c, 0.22)} />
              <stop offset="100%" stopColor={c} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? '#CBD5E1' : '#EEF2F7'}
              strokeWidth={1}
            />
            <text x={plotLeft - 6} y={y(t) + 3} textAnchor="end" className="tnum" fontSize={10} fill="#94A3B8">
              {fmtY(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = plotLeft + slot * i + slot / 2;
          const h = Math.max(1, padTop + plotH - y(d.value));
          const everyOther = n > 8 ? i % 2 === 0 : true;
          return (
            <g key={d.key} onMouseMove={(e) => moveTip(e, d)} onMouseLeave={hide} style={{ cursor: 'default' }}>
              <rect x={cx - slot / 2} y={padTop} width={slot} height={plotH} fill="transparent" />
              <rect
                className="anim-bar-v"
                style={{ animationDelay: `${i * 45}ms` }}
                x={cx - barW / 2}
                y={y(d.value)}
                width={barW}
                height={h}
                rx={4}
                fill={`url(#${gid(d.color)})`}
              />
              {everyOther && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={10} fill="#94A3B8">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
