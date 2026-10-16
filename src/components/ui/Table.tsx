import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  sortable?: boolean;
  sortValue?: (r: Row) => number | string;
  render: (r: Row, index: number) => ReactNode;
  headerHint?: string;
}

interface Props<Row> {
  columns: Column<Row>[];
  rows: Row[];
  getKey: (r: Row) => string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (r: Row) => void;
  activeKey?: string | null;
  maxHeight?: number;
  dense?: boolean;
  stickyHeader?: boolean;
  emptyText?: string;
}

export function Table<Row>({
  columns,
  rows,
  getKey,
  initialSort,
  onRowClick,
  activeKey,
  maxHeight,
  dense = false,
  stickyHeader = true,
  emptyText = 'No rows to show.',
}: Props<Row>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort, columns]);

  const toggleSort = (c: Column<Row>) => {
    if (!c.sortable) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }));
  };

  const cellPad = dense ? 'px-2.5 py-1.5' : 'px-3 py-2.5';

  return (
    <div className="scroll-thin overflow-auto rounded-xl ring-1 ring-slate-200" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
          <tr className="bg-slate-900 text-white">
            {columns.map((c) => {
              const isSorted = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c)}
                  className={`${cellPad} border-r border-white/10 last:border-r-0 text-${c.align ?? 'left'} text-[11px] font-semibold uppercase tracking-wide ${
                    c.sortable ? 'cursor-pointer select-none hover:bg-white/10' : ''
                  }`}
                  style={{ width: c.width }}
                  title={c.headerHint}
                >
                  <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                    {c.header}
                    {c.sortable &&
                      (isSorted ? (
                        sort!.dir === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="opacity-50" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const key = getKey(r);
            const isActive = activeKey != null && key === activeKey;
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(r)}
                className={`transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${
                  isActive ? 'ring-2 ring-inset ring-indigo-500' : ''
                } hover:bg-indigo-50/60`}
                style={{ background: isActive ? 'rgba(99,102,241,0.08)' : i % 2 ? '#F8FAFC' : '#FFFFFF' }}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`${cellPad} border-r border-slate-100 last:border-r-0 text-${c.align ?? 'left'} align-middle`}>
                    {c.render(r, i)}
                  </td>
                ))}
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
