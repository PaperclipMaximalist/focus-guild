import { motion } from 'framer-motion';
import { type Quest } from '../lib/api';
import { formatDeadline, formatMinutes } from '../lib/formatters';
import { CalendarDays, ListChecks, Pencil, Timer, Trash2 } from 'lucide-react';

interface Props {
  quest: Quest;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Optional: tap on the card body opens the detail view. */
  onOpen?: () => void;
}

// Map 0–10 priority score → visual tier
function priorityTier(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 6.5) return 'critical';
  if (score >= 4.5) return 'high';
  if (score >= 2.5) return 'medium';
  return 'low';
}

const TIER_COLOR: Record<ReturnType<typeof priorityTier>, string> = {
  critical: 'var(--color-fire)',
  high:     'var(--color-gold)',
  medium:   'var(--color-primary)',
  low:      'var(--color-teal)',
};

const LOAD_LABEL = ['', 'Easy', 'Easy', 'Mild', 'Mild', 'Medium', 'Medium', 'Hard', 'Hard', 'Brutal', 'Brutal'];

export function QuestCard({ quest, onComplete, onEdit, onDelete, onOpen }: Props) {
  const score = quest.priorityScore ?? 0;
  const tier = priorityTier(score);
  const color = TIER_COLOR[tier];

  const deadline = formatDeadline(quest.deadline);
  const urgent =
    quest.deadline && (new Date(quest.deadline).getTime() - Date.now()) < 24 * 3600 * 1000;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="group relative flex items-start gap-3 overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) p-4 transition hover:border-(--color-muted)"
    >
      {/* Priority-colored left border */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ background: color }} />

      {/* Complete checkbox */}
      <button
        onClick={onComplete}
        className="mt-0.5 flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-(--color-border) bg-transparent transition hover:border-(--color-green) hover:bg-(--color-green)/10"
        title="Complete"
        aria-label="Complete quest"
      />

      {/* Body */}
      <div
        className="min-w-0 flex-1"
        onClick={onOpen}
        style={{ cursor: onOpen ? 'pointer' : 'default' }}
      >
        <div className="text-[0.92rem] font-semibold">{quest.title}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {deadline && deadline !== 'no deadline' && (
            <Tag
              kind={urgent ? 'deadline-urgent' : 'deadline'}
              className={urgent ? 'animate-pulse-red' : ''}
            >
              <CalendarDays size={12} aria-hidden /> {deadline}
            </Tag>
          )}
          <Tag kind="time"><Timer size={12} aria-hidden /> {formatMinutes(quest.estimatedMinutes)}</Tag>
          <Tag kind="load">
            <span className="inline-flex items-end gap-px" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className="w-[3px] rounded-[1px] bg-current"
                  style={{ height: 3 + n * 1.4, opacity: n <= Math.round(quest.mentalLoad / 2) ? 1 : 0.3 }}
                />
              ))}
            </span>
            {LOAD_LABEL[quest.mentalLoad]}
          </Tag>
          {quest.subQuestTotal != null && quest.subQuestTotal > 0 && (
            <Tag kind="time">
              <ListChecks size={12} aria-hidden /> {quest.subQuestDone ?? 0}/{quest.subQuestTotal}
            </Tag>
          )}
        </div>
      </div>

      {/* Right column: priority badge + actions */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border-2 text-sm font-extrabold"
          style={{ borderColor: color, color, background: `${color}1A` }}
          title="Priority score"
        >
          {score.toFixed(1)}
        </div>
        <div className="flex gap-1 opacity-70 transition group-hover:opacity-100">
          <IconBtn onClick={onEdit} title="Edit"><Pencil size={14} aria-hidden /></IconBtn>
          <IconBtn onClick={onDelete} title="Delete"><Trash2 size={14} aria-hidden /></IconBtn>
        </div>
      </div>
    </motion.div>
  );
}

function Tag({
  kind,
  className = '',
  children,
}: {
  kind: 'deadline' | 'deadline-urgent' | 'time' | 'load' | 'xp';
  className?: string;
  children: React.ReactNode;
}) {
  const styles: Record<typeof kind, string> = {
    'deadline':         'bg-(--color-fire)/15 text-(--color-fire)',
    'deadline-urgent':  'bg-(--color-fire)/25 text-(--color-fire)',
    'time':             'bg-(--color-blue)/15 text-(--color-blue)',
    'load':             'bg-(--color-gold)/15 text-(--color-gold)',
    'xp':               'bg-(--color-primary)/15 text-(--color-primary)',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.68rem] font-semibold ${styles[kind]} ${className}`}>
      {children}
    </span>
  );
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-(--color-border) bg-white/5 text-[0.85rem] transition hover:bg-white/15"
    >
      {children}
    </button>
  );
}
