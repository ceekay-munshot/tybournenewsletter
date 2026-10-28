import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { emphasize } from '../lib/emphasis';
import type { Lexicon, Span, Tone } from '../lib/emphasis';

const TONE_CLASS: Record<Tone, string> = {
  up: 'font-semibold text-emerald-700',
  down: 'font-semibold text-rose-700',
  flat: 'font-semibold text-slate-700',
  figure: 'font-semibold text-slate-900',
  entity: 'font-medium text-slate-900',
  period: 'whitespace-nowrap text-slate-400',
  flag: 'font-medium text-amber-800',
};

/** Highlighter-pen stroke across the lower half of the line. */
const marker = (rgba: string): CSSProperties => ({
  backgroundImage: `linear-gradient(transparent 56%, ${rgba} 56%)`,
  boxDecorationBreak: 'clone',
  WebkitBoxDecorationBreak: 'clone',
  padding: '0 1px',
});

function spanStyle(s: Span): CSSProperties | undefined {
  if (s.tone === 'flag') return marker('rgba(245,158,11,0.26)');
  if (!s.key) return undefined;
  return marker(s.tone === 'down' ? 'rgba(244,63,94,0.16)' : 'rgba(16,185,129,0.20)');
}

/** Newsletter prose set in house style by the emphasis engine (lib/emphasis.ts). */
export function Emphasized({ text, lexicon }: { text: string; lexicon: Lexicon }) {
  const spans = useMemo(() => emphasize(text, lexicon), [text, lexicon]);
  return (
    <>
      {spans.map((s, i) =>
        s.tone ? (
          <span key={i} className={s.key ? TONE_CLASS[s.tone].replace('font-semibold', 'font-bold') : TONE_CLASS[s.tone]} style={spanStyle(s)}>
            {s.text}
          </span>
        ) : (
          s.text
        )
      )}
    </>
  );
}
