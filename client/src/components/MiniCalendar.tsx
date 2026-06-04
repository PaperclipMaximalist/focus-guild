/**
 * MiniCalendar — compact month grid. Used as both a deadline picker (in
 * QuestModal) and a day-jumper with heatmap (in GuildFeed via the
 * optional `intensity` prop).
 *
 * Pure, controlled component:
 *   <MiniCalendar value={date | null} onChange={(d) => ...} markers={[Date, ...]} />
 *
 * - Today is highlighted.
 * - Past dates are SELECTABLE (deadlines in the past = immediately overdue,
 *   useful for capturing backlog items). They render in muted red.
 * - markers (e.g. other deadlines) render as dots.
 * - `intensity(date)` paints a colored background per cell (rgba string),
 *   for use as a load heatmap.
 * - `footer` replaces the default deadline-picker footer when set.
 * - Month nav: ‹ ›.
 *
 * Pass `minDate` if you want to disable everything before a specific date.
 */

import { useEffect, useMemo, useState } from 'react';
import { startOfDay, sameDay, WEEKDAY_LETTERS } from '../lib/date';

interface Props {
  value: Date | null;
  onChange: (d: Date | null) => void;
  /** Days of month to mark with a small dot (e.g. other deadlines). */
  markers?: Date[];
  /** Optional hard minimum date. If unset, past dates are allowed (styled red). */
  minDate?: Date;
  /**
   * Per-day background tint for heatmap use. Return any valid CSS color
   * (e.g. `rgba(168,85,247,0.5)`) to fill the cell, or null for none.
   */
  intensity?: (date: Date) => string | null;
  /**
   * Replaces the built-in deadline-picker footer when set. Useful when
   * the calendar isn't being used to pick a deadline (e.g. day-jumping).
   */
  footer?: React.ReactNode;
}

export function MiniCalendar({ value, onChange, markers = [], minDate, intensity, footer }: Props) {
  const today = startOfDay(new Date());
  // Only enforce a hard minimum when the caller passes one. Otherwise past
  // dates are allowed (they render in red to signal immediately-overdue).
  const min = minDate ? startOfDay(minDate) : null;

  // Anchor the visible month on the value, else on today.
  const [anchor, setAnchor] = useState<Date>(value ?? today);

  // When the externally-controlled value jumps to a different month, follow it.
  useEffect(() => {
    if (!value) return;
    if (value.getMonth() !== anchor.getMonth() || value.getFullYear() !== anchor.getFullYear()) {
      setAnchor(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const { weeks, monthLabel } = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<Date | null> = [];
    for (let i = 0; i < startDow; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: Array<Array<Date | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const monthLabel = firstDay.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    return { weeks, monthLabel };
  }, [anchor]);

  const markerSet = useMemo(
    () => new Set(markers.map((d) => startOfDay(d).toISOString())),
    [markers],
  );

  const shift = (deltaMonths: number) => {
    const next = new Date(anchor);
    next.setMonth(next.getMonth() + deltaMonths);
    setAnchor(next);
  };

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => shift(-1)}
          className="text-base px-2 opacity-70 hover:opacity-100"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {monthLabel}
        </p>
        <button
          onClick={() => shift(1)}
          className="text-base px-2 opacity-70 hover:opacity-100"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAY_LETTERS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-muted)' }}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((d, idx) => {
          if (!d) return <div key={idx} />;
          const isToday = sameDay(d, today);
          const isSelected = value ? sameDay(d, value) : false;
          // "Past" means before today, not before min. min only blocks selection.
          const isBeforeToday = d.getTime() < today.getTime();
          const isBlocked = min !== null && d.getTime() < min.getTime();
          const hasMarker = markerSet.has(d.toISOString());

          const baseColor = isSelected
            ? '#fff'
            : isBlocked
            ? 'rgba(148,163,184,0.3)'
            : isBeforeToday
            ? 'var(--color-fire)'   // selectable but red — immediately-overdue warning
            : 'var(--color-text)';

          // intensity heatmap takes precedence over the default "past" tint
          // but never overrides "selected" or "today" — those stay legible.
          const intensityFill = intensity?.(d) ?? null;
          const cellBg = isSelected
            ? 'var(--color-primary)'
            : isToday
              ? 'rgba(139,92,246,0.15)'
              : intensityFill
                ? intensityFill
                : isBeforeToday && !isBlocked
                  ? 'rgba(239,68,68,0.05)'
                  : 'transparent';

          return (
            <button
              key={idx}
              type="button"
              disabled={isBlocked}
              onClick={() => onChange(isSelected ? null : d)}
              title={isBeforeToday && !isBlocked ? 'Past date — this will be immediately overdue' : undefined}
              className="relative aspect-square rounded-md text-xs font-medium transition-colors"
              style={{
                background: cellBg,
                color: baseColor,
                border: isToday && !isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                cursor: isBlocked ? 'not-allowed' : 'pointer',
              }}
            >
              {d.getDate()}
              {hasMarker && !isSelected && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: 'var(--color-gold)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {footer !== undefined ? (
        <div
          className="mt-2 pt-2"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {footer}
        </div>
      ) : value && (
        <div
          className="mt-2 pt-2 flex items-center justify-between text-xs"
          style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
        >
          <span>
            Deadline:{' '}
            <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
              {value.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </span>
          <button
            onClick={() => onChange(null)}
            className="hover:underline"
            style={{ color: 'var(--color-fire)' }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
