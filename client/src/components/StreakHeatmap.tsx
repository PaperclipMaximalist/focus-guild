/**
 * StreakHeatmap — a GitHub-style contribution graph of daily quest
 * completions over the last ~12 weeks. Columns are weeks (Sun-anchored),
 * rows are weekdays; cell intensity scales with that day's completion count.
 *
 * Pure presentational: give it a list of ISO completion timestamps.
 */

import { useMemo } from 'react';

interface Props {
  /** ISO date strings of completions (e.g. quest.completedAt). */
  completions: string[];
  /** How many weeks back to show. Default 12. */
  weeks?: number;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 5-stop intensity ramp from "nothing" to "max".
const RAMP = [
  'rgba(255,255,255,0.05)',
  'rgba(139,92,246,0.30)',
  'rgba(139,92,246,0.52)',
  'rgba(139,92,246,0.76)',
  'var(--color-primary)',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function StreakHeatmap({ completions, weeks = 12 }: Props) {
  const { columns, maxCount, total, bestDay, monthLabels } = useMemo(() => {
    // Count completions per day.
    const counts = new Map<string, number>();
    for (const iso of completions) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    // Anchor: the most recent Saturday (end of this week), go back `weeks`.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay())); // upcoming/﻿this Saturday
    const start = new Date(end);
    start.setDate(start.getDate() - (weeks * 7 - 1));

    const cols: Array<Array<{ date: Date; count: number; inFuture: boolean }>> = [];
    let cursor = new Date(start);
    let max = 0;
    let totalCount = 0;
    let best = 0;
    const labels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;

    for (let w = 0; w < weeks; w += 1) {
      const col: Array<{ date: Date; count: number; inFuture: boolean }> = [];
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(cursor);
        const count = counts.get(dayKey(date)) ?? 0;
        const inFuture = date.getTime() > today.getTime();
        if (!inFuture) { totalCount += count; if (count > best) best = count; }
        if (count > max) max = count;
        col.push({ date, count, inFuture });
        // Month label when the first row of a column crosses into a new month.
        if (d === 0) {
          const m = date.getMonth();
          if (m !== lastMonth) { labels.push({ col: w, label: MONTHS[m]! }); lastMonth = m; }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(col);
    }
    return { columns: cols, maxCount: max, total: totalCount, bestDay: best, monthLabels: labels };
  }, [completions, weeks]);

  const level = (count: number): string => {
    if (count <= 0) return RAMP[0]!;
    if (maxCount <= 1) return RAMP[4]!;
    const t = count / maxCount;
    if (t <= 0.25) return RAMP[1]!;
    if (t <= 0.5) return RAMP[2]!;
    if (t <= 0.75) return RAMP[3]!;
    return RAMP[4]!;
  };

  const CELL = 13; // px including gap

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {total} completed in {weeks} weeks · best day {bestDay}
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div style={{ minWidth: weeks * CELL + 24 }}>
          {/* Month labels */}
          <div className="relative h-3.5 ml-6" style={{ width: weeks * CELL }}>
            {monthLabels.map((m) => (
              <span
                key={`${m.col}-${m.label}`}
                className="absolute text-[0.6rem]"
                style={{ left: m.col * CELL, color: 'var(--color-muted)' }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {/* Weekday rail */}
            <div className="flex flex-col gap-[3px] mr-1 text-[0.55rem]" style={{ color: 'var(--color-muted)' }}>
              {['', 'M', '', 'W', '', 'F', ''].map((l, i) => (
                <span key={i} style={{ height: 10, lineHeight: '10px' }}>{l}</span>
              ))}
            </div>

            {/* Week columns */}
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.map((cell, ri) => (
                  <div
                    key={ri}
                    title={cell.inFuture ? '' : `${cell.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${cell.count} done`}
                    className="rounded-[2px]"
                    style={{
                      width: 10,
                      height: 10,
                      background: cell.inFuture ? 'transparent' : level(cell.count),
                      outline: cell.count > 0 && !cell.inFuture ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1 mt-2 ml-6 text-[0.6rem]" style={{ color: 'var(--color-muted)' }}>
            <span>Less</span>
            {RAMP.map((c, i) => (
              <span key={i} className="rounded-[2px]" style={{ width: 10, height: 10, background: c }} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
