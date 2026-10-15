/**
 * Munshot brand mark — plain wordmark only (no glyph/logo image).
 * `size`: 'sm' header lockup · 'lg' newsletter masthead.
 */
export function MunshotMark({
  size = 'sm',
  className = '',
}: {
  size?: 'sm' | 'lg';
  wordmark?: boolean;
  className?: string;
}) {
  const word = size === 'lg' ? 'text-[24px]' : 'text-[18px]';
  return (
    <span className={`font-display ${word} font-bold tracking-tight text-slate-900 ${className}`}>
      Munshot
    </span>
  );
}
