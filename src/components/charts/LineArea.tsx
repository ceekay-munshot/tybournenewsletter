import { useState } from 'react';
import { useElementWidth, useTip, ChartFrame, type TipRow } from './ChartBase';
import { niceTicks, linScale, linePath, areaPath, polylineLength } from '../../lib/chartMath';

export interface LinePoint {
  label: string;
  value: number | null;
  tipRows?: TipRow[];
  note?: string;
}

interface Props {
  points: LinePoint[];
  color: string;
  format: (n: number) => string;
  height?: number;
  area?: boolean;
  yFromZero?: boolean;
  yAxisFormat?: (n: number) => string;
}

export function LineArea({
  points,
  color,
  format,
  height = 230,
  area = true,
  yFromZero = false,
  yAxisFormat,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const padTop = 14;
  const axisH = 24;
  const yAxisW = 48;
  const plotH = height - padTop - axisH;
  const plotLeft = yAxisW;
  const plotRight = width - 12;
  const plotW = Math.max(40, plotRight - plotLeft);
  const baseY = padTop + plotH;

  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const dataMax = Math.max(1, ...vals);
  const dataMin = vals.length ? Math.min(...vals) : 0;
  const lo = yFromZero ? 0 : Math.max(0, dataMin - (dataMax - dataMin) * 0.4 - 0.001);
  const { ticks, niceMax } = niceTicks(dataMax, 4);
  const yLo = yFromZero ? 0 : lo;
  const yHi = yFromZero ? niceMax : dataMax + (dataMax - dataMin) * 0.25 + 0.001;
  const yscale = linScale(yLo, yHi, baseY, padTop);
  const fmtY = yAxisFormat ?? format;

  const n = points.length || 1;
  const xAt = (i: number) => (n === 1 ? plotLeft + plotW / 2 : plotLeft + (i / (n - 1)) * plotW);

  const pts: [number, number][] = points
    .map((p, i) => (p.value == null ? null : ([xAt(i), yscale(p.value)] as [number, number])))
    .filter((p): p is [number, number] => p != null);

  const dash = polylineLength(pts);
  const gridTicks = yFromZero ? ticks : [yLo, (yLo + yHi) / 2, yHi];

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(xAt(i) - mx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const p = points[best];
    if (p.value == null) {
      hide();
      setHoverIdx(null);
      return;
    }
    setHoverIdx(best);
    show(xAt(best), yscale(p.value), {
      title: p.label,
      color,
      rows: p.tipRows ?? [{ label: 'Value', value: format(p.value) }],
      note: p.note,
    });
  };

  const labelEvery = n > 8 ? Math.ceil(n / 7) : 1;
  const gid = `grad-${color.replace('#', '')}`;

  return (
    <ChartFrame innerRef={ref} tip={tip} width={width}>
      <svg
        width={width}
        height={height}
        role="img"
        onMouseMove={onMove}
        onMouseLeave={() => {
          hide();
          setHoverIdx(null);
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {gridTicks.map((t, i) => (
          <g key={i}>
            <line x1={plotLeft} x2={plotRight} y1={yscale(t)} y2={yscale(t)} stroke="#EEF2F7" strokeWidth={1} />
            <text x={plotLeft - 6} y={yscale(t) + 3} textAnchor="end" className="tnum" fontSize={10} fill="#94A3B8">
              {fmtY(t)}
            </text>
          </g>
        ))}

        {area && pts.length > 1 && <path d={areaPath(pts, baseY)} fill={`url(#${gid})`} />}
        {pts.length > 1 && (
          <path
            className="anim-line"
            style={{ ['--dash' as string]: dash }}
            d={linePath(pts)}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {hoverIdx != null && points[hoverIdx].value != null && (
          <line
            x1={xAt(hoverIdx)}
            x2={xAt(hoverIdx)}
            y1={padTop}
            y2={baseY}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
        )}

        {points.map((p, i) =>
          p.value == null ? null : (
            <circle
              key={i}
              cx={xAt(i)}
              cy={yscale(p.value)}
              r={hoverIdx === i ? 5 : 3}
              fill="#fff"
              stroke={color}
              strokeWidth={2}
              style={{ transition: 'r 0.1s' }}
            />
          )
        )}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={xAt(i)} y={height - 7} textAnchor="middle" fontSize={10} fill="#94A3B8">
              {p.label}
            </text>
          ) : null
        )}
      </svg>
    </ChartFrame>
  );
}
