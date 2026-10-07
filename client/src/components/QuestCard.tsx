/**
 * One quest, as a row in a list.
 *
 * A circle to tick, the title, and one quiet line of facts. It used to be a
 * bordered card with a coloured side bar, three coloured chips, a score ring
 * and two round buttons, so a list of ten quests was forty things shouting.
 * Now colour appears only where it says something: the ring of the circle
 * for quests that rank high, and the deadline when it is close.
 *
 * Put rows inside `<div className="panel rows">` so they share one surface
 * and are parted by hairlines.
 *
 * Tapping the row opens the detail sheet, which has Edit and Delete; the two
 * buttons here appear on hover, for a mouse.
 */

import { motion } from 'framer-motion';
import { type Quest } from '../lib/api';
import { formatDeadline, formatMinutes } from '../lib/formatters';
import { CalendarDays, Check, ListChecks, Pencil, Trash2 } from 'lucide-react';

interface Props {
  quest: Quest;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Optional: tap on the row opens the detail view. */
  onOpen?: () => void;
  /** Selection mode: the circle becomes a checkbox that picks the row instead of completing it. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

// Map 0–10 priority score → visual tier
function priorityTier(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 6.5) return 'critical';
  if (score >= 4.5) return 'high';
  if (score >= 2.5) return 'medium';
  return 'low';
}

/** Only the top two tiers get a colour; the rest stay neutral so those two stand out. */
const RING: Record<ReturnType<typeof priorityTier>, string> = {
  critical: 'var(--color-fire)',
  high: 'var(--color-gold)',
  medium: 'var(--color-border-strong)',
  low: 'var(--color-border-strong)',
};

const LOAD_LABEL = ['', 'Easy', 'Easy', 'Mild', 'Mild', 'Medium', 'Medium', 'Hard', 'Hard', 'Brutal', 'Brutal'];

export function QuestCard({ quest, onComplete, onEdit, onDelete, onOpen, selecting, selected, onToggleSelect }: Props) {
  const score = quest.priorityScore ?? 0;
  const tier = priorityTier(score);

  const deadline = formatDeadline(quest.deadline);
  const hasDeadline = deadline && deadline !== 'no deadline';
  const msLeft = quest.deadline ? new Date(quest.deadline).getTime() - Date.now() : Infinity;
  const urgent = msLeft < 24 * 3600 * 1000;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-white/[0.025]"
      style={selected ? { background: 'color-mix(in srgb, var(--color-primary) 7%, transparent)' } : undefined}
    >
      {selecting ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!selected}
          aria-label={`Select ${quest.title}`}
          onClick={onToggleSelect}
          className="mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] border-2 transition-colors"
          style={{
            borderColor: selected ? 'var(--color-primary)' : 'var(--color-border-strong)',
            background: selected ? 'var(--color-primary)' : 'transparent',
            color: 'var(--color-on-primary)',
          }}
        >
          {selected && <Check size={14} strokeWidth={3} aria-hidden />}
        </button>
      ) : (
        <button
          type="button"
          onClick={onComplete}
          title="Complete"
          aria-label={`Complete ${quest.title}`}
          className="quest-check mt-px grid h-[22px] w-[22px] shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors"
          style={{ borderColor: RING[tier], color: 'var(--color-green)' }}
        >
          <Check size={13} strokeWidth={3} className="opacity-0 transition-opacity" aria-hidden />
        </button>
      )}

      <div
        className="min-w-0 flex-1"
        onClick={selecting ? onToggleSelect : onOpen}
        style={{ cursor: selecting || onOpen ? 'pointer' : 'default' }}
      >
        <div className="text-[0.9375rem] font-semibold leading-snug">{quest.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.78rem] text-(--color-muted)">
          {hasDeadline && (
            <span
              className="inline-flex items-center gap-1 font-medium"
              style={urgent ? { color: 'var(--color-fire)' } : undefined}
            >
              <CalendarDays size={12} aria-hidden /> {deadline}
            </span>
          )}
          <span className="tnum">{formatMinutes(quest.estimatedMinutes)}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-end gap-px" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className="w-[3px] rounded-[1px] bg-current"
                  style={{ height: 3 + n * 1.4, opacity: n <= Math.round(quest.mentalLoad / 2) ? 0.9 : 0.25 }}
                />
              ))}
            </span>
            {LOAD_LABEL[quest.mentalLoad]}
          </span>
          {quest.subQuestTotal != null && quest.subQuestTotal > 0 && (
            <span className="tnum inline-flex items-center gap-1">
              <ListChecks size={12} aria-hidden /> {quest.subQuestDone ?? 0}/{quest.subQuestTotal}
            </span>
          )}
          {quest.tags?.map((t) => (
            <span key={t} className="opacity-80">
              #{t}
            </span>
          ))}
        </div>
      </div>

      {!selecting && (
        <div className="flex shrink-0 items-center gap-0.5">
          <span className="hidden gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 lg:flex">
            <button type="button" onClick={onEdit} title="Edit" aria-label="Edit quest" className="icon-btn h-8 w-8">
              <Pencil size={14} aria-hidden />
            </button>
            <button type="button" onClick={onDelete} title="Delete" aria-label="Delete quest" className="icon-btn h-8 w-8">
              <Trash2 size={14} aria-hidden />
            </button>
          </span>
          <span
            className="tnum w-8 text-right text-[0.8rem] font-semibold"
            title="Priority score"
            style={{ color: tier === 'critical' ? 'var(--color-fire)' : tier === 'high' ? 'var(--color-gold)' : 'var(--color-muted)' }}
          >
            {score.toFixed(1)}
          </span>
        </div>
      )}
    </motion.div>
  );
}
