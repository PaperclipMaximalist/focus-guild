import type { CSSProperties } from 'react';

/**
 * The share of a slider's track that lies left of its thumb, as the `--fill`
 * custom property the range-input style in index.css paints the track from.
 * A browser cannot style "the part before the thumb" in WebKit, so each input
 * says where the split is.
 */
export function rangeFill(value: number, min: number, max: number): CSSProperties {
  const span = max - min;
  const raw = span > 0 ? ((value - min) / span) * 100 : 0;
  const pct = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 0));
  return { '--fill': `${Math.round(pct * 10) / 10}%` } as CSSProperties;
}
