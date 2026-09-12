/**
 * Strand balance — by recency and duration, not hours.
 *
 * IB requires no hour logging, so the default reading of "balance" here is
 * how long each strand has been running and how long since it last saw any
 * activity. Hours appear only when the optional field is switched on in
 * presets, for schools that impose their own quota.
 *
 * A strand that has gone quiet is the signal worth surfacing, so recency is
 * the loud number and item count is the quiet one.
 */

import type { CasStrand, StrandBalance } from '../../lib/api';

const STRAND_COLOR: Record<CasStrand, string> = {
  creativity: '#a855f7',
  activity: '#22c55e',
  service: '#3b82f6',
};

const STRAND_LABEL: Record<CasStrand, string> = {
  creativity: 'Creativity',
  activity: 'Activity',
  service: 'Service',
};

/** Quiet for over a month reads as a gap worth acting on. */
const STALE_DAYS = 30;

function recency(days: number | null): { text: string; stale: boolean } {
  if (days === null) return { text: 'no activity yet', stale: true };
  if (days === 0) return { text: 'active today', stale: false };
  if (days === 1) return { text: 'active yesterday', stale: false };
  return { text: `${days}d since activity`, stale: days >= STALE_DAYS };
}

export function CasBalance({ balance, showHours }: { balance: StrandBalance[]; showHours: boolean }) {
  const maxDuration = Math.max(1, ...balance.map((b) => b.totalDurationDays));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        Strand balance
      </h2>

      <div className="flex flex-col gap-2">
        {balance.map((b) => {
          const r = recency(b.daysSinceLastActivity);
          return (
            <div
              key={b.strand}
              className="rounded-(--radius-card) border p-3"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold" style={{ color: STRAND_COLOR[b.strand] }}>
                  {STRAND_LABEL[b.strand]}
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: r.stale ? 'var(--color-gold)' : 'var(--color-muted)' }}
                >
                  {r.text}
                </span>
              </div>

              {/* Duration bar, scaled against the busiest strand. */}
              <div
                className="mt-2 h-2 overflow-hidden rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(b.totalDurationDays / maxDuration) * 100}%`,
                    background: STRAND_COLOR[b.strand],
                  }}
                />
              </div>

              <p className="mt-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                {b.itemCount} item{b.itemCount === 1 ? '' : 's'}
                {' · '}
                {b.totalDurationDays}d of commitment
                {showHours && b.totalHours != null && ` · ${b.totalHours}h`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
