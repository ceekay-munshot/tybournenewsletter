import { Card } from './ui/Card';
import { directionColor } from '../lib/brand';
import type { AuxTable } from '../types';

/** Renders a connector-supplied supporting table (sector flows, entries/exits,
 *  accelerating vs decelerating…) as a bordered table, matching the breakdown style. */
export function AuxTableCard({ table }: { table: AuxTable }) {
  const alignOf = (i: number) => table.align?.[i] ?? (i === 0 ? 'left' : 'right');
  return (
    <Card pad={false} className="mb-4">
      <div className="p-4 pb-2">
        <h3 className="font-display text-[15px] font-bold text-slate-900">{table.title}</h3>
        {table.subtitle && <p className="text-[12px] text-slate-500">{table.subtitle}</p>}
      </div>
      <div className="px-4 pb-4">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                {table.headers.map((h, i) => (
                  <th
                    key={i}
                    className={`border-r border-slate-200 px-3 py-2.5 last:border-r-0 ${alignOf(i) === 'right' ? 'text-right' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-slate-100 last:border-b-0">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`border-r border-slate-100 px-3 py-2 align-top last:border-r-0 ${
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
                  <td colSpan={table.headers.length} className="px-3 py-6 text-center text-[12px] text-slate-400">
                    Nothing to show this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
