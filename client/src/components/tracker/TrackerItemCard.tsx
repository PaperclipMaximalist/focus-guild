/**
 * One tracker item.
 *
 * The next action is the headline and the title is the subtitle, deliberately
 * inverted from the usual layout: what the user needs at a glance is the
 * physical first step, not the name of the thing. An item with no next action
 * says so loudly, because that is the state worth fixing.
 *
 * Every control is a real tap target laid out along the bottom edge of the
 * card — nothing here reveals itself on hover, which does not exist on a phone.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ApiRequestError,
  type CasStrand,
  type TrackerConfigShape,
  type TrackerItem,
  type TrackerStatus,
} from '../../lib/api';
import { hasCourseworkConflict, useTrackerStore } from '../../store/useTrackerStore';
import { useToastStore } from '../Toasts';

interface Props {
  item: TrackerItem;
  config: TrackerConfigShape;
  /** CAS lens: surfaces strands, outcomes and reflections instead of domain. */
  casMode: boolean;
  onEdit: (item: TrackerItem) => void;
  onReflect: (item: TrackerItem) => void;
}

const STRAND_COLOR: Record<CasStrand, string> = {
  creativity: '#a855f7',
  activity: '#22c55e',
  service: '#3b82f6',
};

const STATUS_COLOR: Record<TrackerStatus, string> = {
  TODO: 'var(--color-muted)',
  ACTIVE: 'var(--color-primary)',
  BLOCKED: 'var(--color-gold)',
  DONE: 'var(--color-green)',
  DROPPED: 'var(--color-muted)',
};

function formatDue(due: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const d = new Date(due);
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 0) return { text: 'due today', overdue: true };
  if (days === 1) return { text: 'due tomorrow', overdue: false };
  if (days < 7) return { text: `due in ${days}d`, overdue: false };
  return { text: `due ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, overdue: false };
}

export function TrackerItemCard({ item, config, casMode, onEdit, onReflect }: Props) {
  const { updateItem, dropItem, scheduleItem, unscheduleItem, linkedQuests } = useTrackerStore();
  const pushToast = useToastStore((s) => s.push);
  const [busy, setBusy] = useState(false);

  const due = formatDue(item.dueDate);
  const conflict = hasCourseworkConflict(item);
  const terminal = item.status === 'DONE' || item.status === 'DROPPED';
  const linkedQuest = item.questId ? linkedQuests.find((q) => q.id === item.questId) : undefined;
  // A link whose quest was deleted from the feed: offer to re-schedule.
  const danglingLink = Boolean(item.questId && !linkedQuest);

  /** Surfaces the server's cap / next-action rules instead of swallowing them. */
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const known = err instanceof ApiRequestError;
      pushToast({
        title:
          known && err.code === 'ACTIVE_CAP_REACHED'
            ? 'Active cap reached'
            : known && err.code === 'NEXT_ACTION_REQUIRED'
              ? 'Needs a next action'
              : 'That did not save',
        sub: known ? err.detail : String(err),
        icon: known && err.code === 'ACTIVE_CAP_REACHED' ? '🧱' : '⚠️',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-(--radius-card) border p-3.5"
      style={{
        borderColor: conflict ? 'rgba(239,68,68,0.45)' : 'var(--color-border)',
        background: 'var(--color-surface)',
        opacity: terminal ? 0.6 : 1,
      }}
    >
      {/* Meta line: code, grouping context, due date. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--color-muted)' }}>
        <span className="font-mono font-semibold" style={{ color: 'var(--color-primary)' }}>
          {item.code}
        </span>
        {!casMode && item.domain && <span>· {item.domain.name}</span>}
        {due && (
          <span style={{ color: due.overdue ? 'var(--color-fire)' : 'var(--color-muted)' }}>
            · {due.text}
          </span>
        )}
        {item.isCasProject && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--color-primary)' }}>
            project
          </span>
        )}
        {config.showHours && item.hours != null && <span>· {item.hours}h</span>}
      </div>

      {/* The headline is the next action — the physical first step. */}
      {item.nextAction ? (
        <>
          <p className="text-[15px] font-semibold leading-snug">{item.nextAction}</p>
          <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--color-muted)' }}>
            {item.title}
          </p>
        </>
      ) : (
        <>
          <p className="text-[15px] font-semibold leading-snug">{item.title}</p>
          {!terminal && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="mt-1 text-xs font-semibold underline"
              style={{ color: 'var(--color-gold)' }}
            >
              + add a next step
            </button>
          )}
        </>
      )}

      {/* CAS lens detail: strands, evidenced outcomes, reflection count. */}
      {casMode && (
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
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => updateItem(item.id, { casStrands: [] }))}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text)' }}
            >
              Untag CAS
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => updateItem(item.id, { isCourseworkLinked: false }))}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text)' }}
            >
              Unlink coursework
            </button>
          </div>
        </div>
      )}

      {/* Scheduler link state. */}
      {item.questId && (
        <p className="mt-2 text-xs" style={{ color: danglingLink ? 'var(--color-gold)' : 'var(--color-teal)' }}>
          {danglingLink
            ? '⚠ Linked quest no longer exists'
            : `⚡ Scheduled as “${linkedQuest?.title ?? 'a quest'}”`}
          {' · '}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => unscheduleItem(item.id))}
            className="underline"
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
          onChange={(e) => run(() => updateItem(item.id, { status: e.target.value as TrackerStatus }))}
          className="rounded-full border px-2.5 py-1.5 text-xs font-semibold outline-none"
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

        {item.status === 'ACTIVE' && !item.questId && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => scheduleItem(item.id))}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'rgba(20,184,166,0.15)', color: 'var(--color-teal)' }}
          >
            ⚡ Schedule
          </button>
        )}

        {casMode && (
          <button
            type="button"
            onClick={() => onReflect(item)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--color-primary)' }}
          >
            ✍ Reflect{item.reflections.length > 0 ? ` (${item.reflections.length})` : ''}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
          >
            Edit
          </button>
          {!terminal && (
            // One tap, no confirmation — dropping is meant to be cheap.
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => dropItem(item.id))}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
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
