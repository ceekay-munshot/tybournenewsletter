import { useElementWidth, useTip, ChartFrame } from './ChartBase';
import { linScale, linePath, areaPath } from '../../lib/chartMath';

export interface SparkPoint {
  label: string;
  value: number;
}

/** Tiny trend line (no axes) with a hover tooltip. */
export function Sparkline({
  points,
  color,
  height = 40,
  format,
  area = true,
}: {
  points: SparkPoint[];
  color: string;
  height?: number;
  format: (n: number) => string;
  area?: boolean;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>(160);
  const { tip, show, hide } = useTip();
  if (!points.length) return <div style={{ height }} />;

  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = 5;
  const x = (i: number) =>
    points.length <= 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - 2 * pad);
  const y = linScale(lo === hi ? lo - 1 : lo, hi, height - pad, pad);
  const pts: [number, number][] = points.map((p, i) => [x(i), y(p.value)]);

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    let best = 0;
    let bd = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(x(i) - mx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    show(x(best), y(points[best].value), {
      title: points[best].label,
      color,
      rows: [{ label: 'Value', value: format(points[best].value) }],
    });
  };

  const gid = `sp-${color.replace('#', '')}`;
  return (
    <ChartFrame innerRef={ref} tip={tip} width={width}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={hide} role="img">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {area && pts.length > 1 && <path d={areaPath(pts, height - pad)} fill={`url(#${gid})`} />}
        {pts.length > 1 && (
          <path
            className="anim-line"
            style={{ ['--dash' as string]: 600 }}
            d={linePath(pts)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {pts.length > 0 && (
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
        )}
      </svg>
    </ChartFrame>
  );
}
