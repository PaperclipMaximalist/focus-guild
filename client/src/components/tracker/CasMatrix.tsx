/**
 * The 7×3 coverage matrix: learning outcomes against strands.
 *
 * Laid out with outcomes as rows and strands as columns rather than the other
 * way round, because 3 columns fit a phone and 7 do not. Tapping a cell lists
 * the item codes behind it — the grid answers "where are the holes", the
 * expansion answers "what is already covering this".
 *
 * Uncovered outcomes get their own call-out above the grid: an outcome with no
 * evidence in any strand is the only cell state that is actually actionable.
 */

import { useState } from 'react';
import type { CasStrand, CoverageMatrix } from '../../lib/api';

const STRAND_COLOR: Record<CasStrand, string> = {
  creativity: '#a855f7',
  activity: '#22c55e',
  service: '#3b82f6',
};

const STRAND_SHORT: Record<CasStrand, string> = {
  creativity: 'Creat.',
  activity: 'Activ.',
  service: 'Serv.',
};

export function CasMatrix({ matrix }: { matrix: CoverageMatrix }) {
  const [open, setOpen] = useState<string | null>(null);

  const cellAt = (outcome: number, strand: CasStrand) =>
    matrix.cells.find((c) => c.outcome === outcome && c.strand === strand);

  const pct = matrix.totalCells === 0 ? 0 : Math.round((matrix.coveredCount / matrix.totalCells) * 100);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
          Coverage
        </h2>
        <span className="text-sm font-semibold">
          {matrix.coveredCount}/{matrix.totalCells}
          <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--color-muted)' }}>
            pairings ({pct}%)
          </span>
        </span>
      </div>

      {matrix.uncoveredOutcomes.length > 0 && (
        <div
          className="rounded-(--radius-card) border p-3"
          style={{ borderColor: 'rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.08)' }}
        >
          <p className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>
            No evidence at all for {matrix.uncoveredOutcomes.length} outcome
            {matrix.uncoveredOutcomes.length > 1 ? 's' : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matrix.uncoveredOutcomes.map((lo) => (
              <span
                key={lo}
                className="rounded px-2 py-1 text-xs font-bold"
                style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--color-gold)' }}
              >
                LO{lo}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className="overflow-hidden rounded-(--radius-card) border"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        {/* Header row */}
        <div className="grid grid-cols-[2.75rem_1fr_1fr_1fr] border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div />
          {matrix.strands.map((s) => (
            <div
              key={s}
              className="py-2 text-center text-[11px] font-bold uppercase tracking-wide"
              style={{ color: STRAND_COLOR[s] }}
            >
              {STRAND_SHORT[s]}
            </div>
          ))}
        </div>

        {matrix.outcomes.map((lo) => {
          const rowEmpty = matrix.uncoveredOutcomes.includes(lo);
          return (
            <div
              key={lo}
              className="grid grid-cols-[2.75rem_1fr_1fr_1fr] border-b last:border-b-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div
                className="grid place-items-center text-xs font-bold"
                style={{ color: rowEmpty ? 'var(--color-gold)' : 'var(--color-muted)' }}
              >
                LO{lo}
              </div>
              {matrix.strands.map((s) => {
                const cell = cellAt(lo, s);
                const count = cell?.codes.length ?? 0;
                const key = `${lo}-${s}`;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={count === 0}
                    onClick={() => setOpen((prev) => (prev === key ? null : key))}
                    aria-label={`LO${lo} ${s}: ${count} item${count === 1 ? '' : 's'}`}
                    className="m-1 grid h-10 place-items-center rounded-lg text-sm font-bold transition-colors"
                    style={{
                      background: count > 0 ? `${STRAND_COLOR[s]}2e` : 'rgba(255,255,255,0.035)',
                      color: count > 0 ? STRAND_COLOR[s] : 'rgba(148,163,184,0.35)',
                      outline: open === key ? `2px solid ${STRAND_COLOR[s]}` : 'none',
                    }}
                  >
                    {count > 0 ? count : '·'}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {open && (
        <div
          className="rounded-(--radius-card) border p-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            LO{open.split('-')[0]} · {open.split('-')[1]}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(matrix.cells.find(
              (c) => `${c.outcome}-${c.strand}` === open,
            )?.codes ?? []).map((code) => (
              <span
                key={code}
                className="rounded px-2 py-1 font-mono text-xs font-bold"
                style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--color-primary)' }}
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
