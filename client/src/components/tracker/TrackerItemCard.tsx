/**
 * One tracker item.
 *
 * The next action is the headline and the title is the subtitle, deliberately
 * inverted from the usual layout: what the user needs at a glance is the
 * physical first step, not the name of the thing. An item with no next action
 * says so loudly, because that is the state worth fixing.
 *
 * Dropping and finishing are one tap with no confirmation. What makes that
 * safe is the Undo on the toast that follows: the card vanishes from the
 * default view immediately, so a mis-tap has to be recoverable without going
 * hunting through "done & dropped".
 *
 * Every control is a real tap target laid out along the bottom edge of the
 * card — nothing here reveals itself on hover, which does not exist on a phone.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TrackerConfigShape, TrackerItem, TrackerStatus } from '../../lib/api';
import { STRAND_COLOR, formatDue, trackerErrorToast } from '../../lib/tracker';
import { sfxClick, sfxComplete, sfxStart } from '../../lib/sfx';
import { hasCourseworkConflict, useTrackerStore } from '../../store/useTrackerStore';
import { useToastStore } from '../Toasts';
import { CalendarPlus, CircleCheck, Footprints, Leaf, PenLine, TriangleAlert, Zap } from 'lucide-react';

interface Props {
  item: TrackerItem;
  config: TrackerConfigShape;
  /** CAS lens: surfaces strands, outcomes and reflections instead of domain. */
  casMode: boolean;
  onEdit: (item: TrackerItem) => void;
  onReflect: (item: TrackerItem) => void;
  /** Off when the card already sits under its own domain heading. */
  showDomain?: boolean;
}

const STATUS_COLOR: Record<TrackerStatus, string> = {
  TODO: 'var(--color-muted)',
  ACTIVE: 'var(--color-primary)',
  BLOCKED: 'var(--color-gold)',
  DONE: 'var(--color-green)',
  DROPPED: 'var(--color-muted)',
};

const pill = 'rounded-full px-3 py-2 text-xs font-semibold transition-opacity active:opacity-60 disabled:opacity-40';

export function TrackerItemCard({ item, config, casMode, onEdit, onReflect, showDomain = true }: Props) {
  const { updateItem, dropItem, scheduleItem, unscheduleItem, linkedQuests } = useTrackerStore();
  const pushToast = useToastStore((s) => s.push);
  const [busy, setBusy] = useState(false);

  const due = formatDue(item.dueDate);
  const conflict = hasCourseworkConflict(item);
  const terminal = item.status === 'DONE' || item.status === 'DROPPED';

  const linkedQuest = item.questId ? linkedQuests.find((q) => q.id === item.questId) : undefined;
  /** Linked, and the quest is still waiting in the feed. */
  const inFeed = linkedQuest?.status === 'ACTIVE';
  /** Linked, but the quest was deleted from the feed. */
  const dangling = Boolean(item.questId && !linkedQuest);
  /** Linked quest finished — the item's *next* step is what to schedule now. */
  const questDone = Boolean(linkedQuest && !inFeed);
  const canSchedule = item.status === 'ACTIVE' && !inFeed && Boolean(item.nextAction?.trim());

  /** Surfaces the server's cap / next-action rules instead of swallowing them. */
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (err) {
      pushToast({ ...trackerErrorToast(err), variant: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Any change that hides the card from the default view gets an Undo. */
  const offerUndo = (title: string, icon: LucideIcon, previous: TrackerStatus) => {
    pushToast({
      title,
      sub: `${item.code} · ${item.nextAction ?? item.title}`,
      icon,
      variant: 'xp',
      action: {
        label: 'Undo',
        run: () => void run(() => updateItem(item.id, { status: previous })),
      },
    });
  };

  const changeStatus = async (next: TrackerStatus) => {
    const previous = item.status;
    if (next === previous) return;
    const ok = await run(() => updateItem(item.id, { status: next }));
    if (!ok) return;
    if (next === 'DONE') {
      sfxComplete();
      offerUndo('Done', CircleCheck, previous);
    } else if (next === 'DROPPED') {
      sfxClick();
      offerUndo('Dropped', Leaf, previous);
    } else {
      sfxClick();
    }
  };

  const drop = async () => {
    const previous = item.status;
    if (await run(() => dropItem(item.id))) {
      sfxClick();
      offerUndo('Dropped', Leaf, previous);
    }
  };

  const schedule = async () => {
    if (await run(() => scheduleItem(item.id))) {
      sfxStart();
      pushToast({
        title: 'Sent to the feed',
        sub: item.nextAction ?? item.title,
        icon: Zap,
        variant: 'xp',
      });
    }
  };

  return (
    <motion.article
      id={`item-${item.code}`}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-(--radius-card) border p-3.5"
      style={{
        borderColor: conflict ? 'rgba(239,68,68,0.45)' : 'var(--color-border)',
        background: 'var(--color-surface)',
        opacity: terminal ? 0.6 : 1,
        // A left rail in the status colour makes a scrolled list scannable.
        boxShadow: `inset 3px 0 0 ${STATUS_COLOR[item.status]}`,
      }}
    >
      {/* Meta line: code, grouping context, due date. */}
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--color-muted)' }}>
        <span className="font-mono font-semibold" style={{ color: 'var(--color-primary)' }}>
          {item.code}
        </span>
        {!casMode && showDomain && item.domain && <span>· {item.domain.name}</span>}
        {due && !terminal && (
          <span
            className={due.urgent ? 'font-semibold' : undefined}
            style={{ color: due.urgent ? 'var(--color-fire)' : 'var(--color-muted)' }}
          >
            · {due.text}
          </span>
        )}
        {item.isCasProject && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--color-primary)' }}
          >
            project
          </span>
        )}
        {config.showHours && item.hours != null && <span>· {item.hours}h</span>}
      </div>

      {/* The headline is the next action — the physical first step. */}
      {item.nextAction ? (
        <>
          <p className={`text-[15px] font-semibold leading-snug ${item.status === 'DONE' ? 'line-through' : ''}`}>
            {item.nextAction}
          </p>
          <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--color-muted)' }}>
            {item.title}
          </p>
        </>
      ) : (
        <>
          <p className={`text-[15px] font-semibold leading-snug ${item.status === 'DONE' ? 'line-through' : ''}`}>
            {item.title}
          </p>
          {!terminal && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="mt-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--color-gold)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Footprints size={12} aria-hidden /> Add a next step</span>
            </button>
          )}
        </>
      )}

      {/* CAS lens detail: strands, evidenced outcomes. */}
      {casMode && (item.casStrands.length > 0 || item.learningOutcomes.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.casStrands.map((s) => (
            <span
              key={s}
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: `${STRAND_COLOR[s]}22`, color: STRAND_COLOR[s] }}
            >
              {s}
            </span>
          ))}
          {item.learningOutcomes.map((lo) => (
            <span
              key={lo}
              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-muted)' }}
            >
              LO{lo}
            </span>
          ))}
        </div>
      )}

      {/* Coursework conflict: a fix in two taps, not a save-blocker. */}
      {conflict && (
        <div
          className="mt-2.5 rounded-lg border p-2.5"
          style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}
        >
          <p className="text-xs leading-snug" style={{ color: '#fca5a5' }}>
            Counted as both CAS and DP coursework. CAS may not double-count — resolve one side.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => updateItem(item.id, { casStrands: [] }))}
              className={pill}
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text)' }}
            >
              Untag CAS
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => updateItem(item.id, { isCourseworkLinked: false }))}
              className={pill}
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text)' }}
            >
              Unlink coursework
            </button>
          </div>
        </div>
      )}

      {/* Scheduler link state. */}
      {item.questId && !terminal && (
        <p
          className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs"
          style={{ color: inFeed ? 'var(--color-teal)' : 'var(--color-gold)' }}
        >
          {inFeed && (
            <Link to="/feed" className="font-semibold underline-offset-2 hover:underline">
              <span className="inline-flex items-center gap-1.5"><Zap size={12} aria-hidden /> In the Guild Feed</span>
            </Link>
          )}
          {questDone && <span className="inline-flex items-center gap-1.5"><CircleCheck size={12} aria-hidden /> Last scheduled step done</span>}
          {dangling && <span className="inline-flex items-center gap-1.5"><TriangleAlert size={12} aria-hidden /> Quest removed from feed</span>}
          <span style={{ color: 'var(--color-muted)' }}>·</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => unscheduleItem(item.id))}
            className="py-1 underline"
            style={{ color: 'var(--color-muted)' }}
          >
            unlink
          </button>
        </p>
      )}

      {/* Actions: a single reachable row, no hover required. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={item.status}
          disabled={busy}
          aria-label={`Status of ${item.code}`}
          onChange={(e) => changeStatus(e.target.value as TrackerStatus)}
          className="rounded-full border px-2.5 py-2 text-xs font-semibold outline-none"
          style={{
            borderColor: 'var(--color-border)',
            background: 'rgba(255,255,255,0.04)',
            color: STATUS_COLOR[item.status],
          }}
        >
          {(Object.keys(config.statusLabels) as TrackerStatus[]).map((s) => (
            <option key={s} value={s} style={{ background: 'var(--color-surface2)', color: 'var(--color-text)' }}>
              {config.statusLabels[s]}
            </option>
          ))}
        </select>

        {canSchedule && (
          <button
            type="button"
            disabled={busy}
            onClick={schedule}
            className={pill}
            style={{ background: 'rgba(20,184,166,0.15)', color: 'var(--color-teal)' }}
          >
            <span className="inline-flex items-center gap-1.5"><CalendarPlus size={13} aria-hidden /> Schedule</span>
          </button>
        )}

        {casMode && (
          <button
            type="button"
            onClick={() => onReflect(item)}
            className={pill}
            style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--color-primary)' }}
          >
            <span className="inline-flex items-center gap-1.5"><PenLine size={13} aria-hidden /> Reflect{item.reflections.length > 0 ? ` · ${item.reflections.length}` : ''}</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className={pill}
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
          >
            Edit
          </button>
          {!terminal && (
            // One tap, no confirmation — the toast's Undo is the safety net.
            <button
              type="button"
              disabled={busy}
              onClick={drop}
              className={pill}
              style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}
            >
              Drop
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
