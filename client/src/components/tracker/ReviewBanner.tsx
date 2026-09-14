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
import type { TrackerConfigShape } from '../../lib/api';
import { useTrackerStore } from '../../store/useTrackerStore';
import { sfxComplete } from '../../lib/sfx';
import { useToastStore } from '../Toasts';
import { ChevronDown, ChevronRight, Compass } from 'lucide-react';

interface Props {
  config: TrackerConfigShape;
}

export function ReviewBanner({ config }: Props) {
  const { lastReviewedAt, markReviewed } = useTrackerStore();
  const [expanded, setExpanded] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  const daysSince =
    lastReviewedAt === null
      ? null
      : Math.floor((Date.now() - new Date(lastReviewedAt).getTime()) / 86_400_000);

  const due = daysSince === null || daysSince >= config.reviewCadenceDays;
  if (!due || config.reviewPrompts.length === 0) return null;

  return (
    <section
      className="rounded-(--radius-card) border px-3.5 py-2.5"
      style={{ borderColor: 'color-mix(in srgb, var(--color-gold) 50%, transparent)', background: 'color-mix(in srgb, var(--color-gold) 12%, transparent)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-sm font-bold" style={{ color: 'var(--color-gold)' }}>
          <Compass size={16} className="mr-1.5 inline -translate-y-px" aria-hidden />Review due
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-muted)' }}>
            {daysSince === null
              ? 'never reviewed'
              : `${daysSince}d since the last one · every ${config.reviewCadenceDays}d`}
          </span>
        </span>
        <span style={{ color: 'var(--color-gold)' }}>{expanded ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}</span>
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
            onClick={() => {
              markReviewed();
              sfxComplete();
              pushToast({
                title: 'Review done',
                sub: `Next one in ${config.reviewCadenceDays} day${config.reviewCadenceDays === 1 ? '' : 's'}`,
                icon: Compass,
                variant: 'xp',
              });
            }}
            className="mt-3 w-full rounded-lg py-2.5 text-sm font-bold"
            style={{ background: 'var(--color-gold)', color: 'var(--color-on-primary)' }}
          >
            Mark reviewed
          </button>
        </>
      )}
    </section>
  );
}
