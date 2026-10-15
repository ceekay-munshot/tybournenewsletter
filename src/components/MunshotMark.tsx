import { useState } from 'react';

/**
 * Munshot brand mark. Prefers the real logo at /munshot-logo.png (drop it into
 * public/ or let the refresh pipeline fetch it); if that 404s or fails to load it
 * falls back to a crisp gradient "M" wordmark so the brand never breaks.
 *
 * `size`:  'sm' header lockup · 'lg' newsletter masthead.
 * `wordmark`: show the "Munshot" word beside the glyph (default true).
 */
export function MunshotMark({
  size = 'sm',
  wordmark = true,
  className = '',
}: {
  size?: 'sm' | 'lg';
  wordmark?: boolean;
  className?: string;
}) {
  const [imgOk, setImgOk] = useState(true);
  const src = `${import.meta.env.BASE_URL}munshot-logo.png`;

  const lg = size === 'lg';
  const imgH = lg ? 'h-10' : 'h-7';

  if (imgOk) {
    return (
      <img
        src={src}
        alt="Munshot"
        className={`${imgH} w-auto ${className}`}
        onError={() => setImgOk(false)}
      />
    );
  }

  const glyph = lg ? 'h-10 w-10 rounded-xl' : 'h-7 w-7 rounded-lg';
  const stroke = lg ? 2.2 : 1.8;
  const word = lg ? 'text-[22px]' : 'text-[17px]';

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span
        className={`grid ${glyph} place-items-center text-white shadow-sm`}
        style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 55%, #EC4899 100%)' }}
        aria-hidden
      >
        <svg width={lg ? 20 : 14} height={lg ? 20 : 14} viewBox="0 0 14 14" fill="none">
          <path
            d="M2 11V4.2L7 8l5-3.8V11"
            stroke="#fff"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {wordmark && (
        <span className={`font-display ${word} font-bold tracking-tight text-slate-900`}>Munshot</span>
      )}
    </span>
  );
}
