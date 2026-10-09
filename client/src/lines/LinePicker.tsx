/**
 * Choose the line the app runs on. Each row shows the line's own three
 * colours, so the choice can be made before making it.
 */

import { useEffect, useState } from 'react';
import { allLines, chooseLine, currentLine, subscribeLine } from './current';
import type { Line } from './types';

export function LinePicker() {
  const [lines, setLines] = useState<Line[]>([currentLine()]);
  const [chosen, setChosen] = useState(currentLine().id);

  useEffect(() => {
    let alive = true;
    allLines().then((all) => { if (alive) setLines(all); });
    const stop = subscribeLine(() => setChosen(currentLine().id));
    return () => { alive = false; stop(); };
  }, []);

  if (lines.length < 2) return null;

  return (
    <div role="radiogroup" aria-label="Line" className="rows -mx-1">
      {lines.map((l) => {
        const on = l.id === chosen;
        return (
          <button
            key={l.id}
            role="radio"
            aria-checked={on}
            onClick={() => chooseLine(l.id)}
            className="flex min-h-12 w-full items-center gap-3 px-1 py-2 text-left"
          >
            <span
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2"
              style={{ borderColor: on ? 'var(--color-primary)' : 'var(--color-border-strong)' }}
              aria-hidden
            >
              {on && <span className="h-1.5 w-1.5 rounded-full bg-(--color-primary)" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-(--color-text)">{l.name}</span>
              <span className="block text-xs text-(--color-muted)">{l.journey}</span>
            </span>
            <span className="flex shrink-0 overflow-hidden rounded-(--radius-sm) border border-(--color-border-strong)" aria-hidden>
              {l.swatch.map((c) => (
                <span key={c} className="h-5 w-4" style={{ background: c }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
