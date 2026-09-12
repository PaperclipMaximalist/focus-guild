/**
 * Review-due banner.
 *
 * What the configured review cadence produces is this and nothing else: a
 * banner on the tracker page listing the user's own prompts. No notifications,
 * no nagging — a review you are ambushed into is a review you dismiss.
 *
 * "Last reviewed" is kept in localStorage rather than the database: it is a
 * per-device reading habit, not shared state, and storing it needs no schema
 * change. The cost is that reviews don't sync across devices, which is the
 * right trade for a single-user tracker.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { TrackerConfigShape } from '../../lib/api';
import { useTrackerStore } from '../../store/useTrackerStore';

interface Props {
  config: TrackerConfigShape;
}

export function ReviewBanner({ config }: Props) {
  const { lastReviewedAt, markReviewed } = useTrackerStore();
  const [expanded, setExpanded] = useState(false);

  const daysSince =
    lastReviewedAt === null
      ? null
      : Math.floor((Date.now() - new Date(lastReviewedAt).getTime()) / 86_400_000);

  const due = daysSince === null || daysSince >= config.reviewCadenceDays;
  if (!due || config.reviewPrompts.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-(--radius-card) border p-3.5"
      style={{ borderColor: 'rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.08)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-bold" style={{ color: 'var(--color-gold)' }}>
          Review due
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-muted)' }}>
            {daysSince === null
              ? 'never reviewed'
              : `${daysSince}d since the last one · every ${config.reviewCadenceDays}d`}
          </span>
        </span>
        <span style={{ color: 'var(--color-gold)' }}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {config.reviewPrompts.map((prompt, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug">
                <span style={{ color: 'var(--color-gold)' }}>·</span>
                <span>{prompt}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={markReviewed}
            className="mt-3 w-full rounded-lg py-2.5 text-sm font-bold"
            style={{ background: 'var(--color-gold)', color: '#1a1205' }}
          >
            Mark reviewed
          </button>
        </>
      )}
    </motion.section>
  );
}
