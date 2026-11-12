/**
 * Add time now: for someone who opens the app after the planner's hours (or
 * once today's time has run out) wanting to do one thing. Three taps that set
 * the time available today, so nobody has to know what the slider is for.
 *
 * Shows only when there is a schedule, no time left today, and quests to plan;
 * otherwise it renders `fallback` (or nothing).
 */

import { useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useScheduleStore } from '../store/useScheduleStore';
import { useQuestStore } from '../store/useQuestStore';
import { useToastStore } from './Toasts';

const CHOICES = [
  { minutes: 30, label: '30 min', name: 'Add 30 minutes now' },
  { minutes: 60, label: '1 hour', name: 'Add 1 hour now' },
  { minutes: 120, label: '2 hours', name: 'Add 2 hours now' },
] as const;

export function AddTimeNow({ className = '', fallback = null }: { className?: string; fallback?: ReactNode }) {
  const available = useScheduleStore((s) => s.available);
  const setAvailable = useScheduleStore((s) => s.setAvailable);
  const hasQuests = useQuestStore((s) => s.quests.length > 0);
  const pushToast = useToastStore((s) => s.push);
  const [saving, setSaving] = useState<number | null>(null);
  // A ref as well as state: two taps in one frame must still send one request.
  const busy = useRef(false);

  if (!available || available.minutes !== 0 || !hasQuests) return <>{fallback}</>;

  const add = async (minutes: number) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(minutes);
    let failed = false;
    try {
      await setAvailable(minutes);
      // The store records a failed request as its error rather than throwing.
      if (useScheduleStore.getState().error) failed = true;
    } catch {
      failed = true;
    } finally {
      busy.current = false;
      setSaving(null);
    }
    if (failed) pushToast({ title: 'Could not add the time', sub: 'Nothing changed. Try again.', icon: X, variant: 'error' });
  };

  return (
    <div className={className} aria-busy={saving !== null}>
      <p className="text-sm text-(--color-muted)">Have time now? Add some and the planner fills it.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.minutes}
            type="button"
            // Not `disabled`: that would throw keyboard focus off the button mid-save.
            aria-disabled={saving !== null}
            aria-label={c.name}
            onClick={() => void add(c.minutes)}
            className="btn-quiet min-h-11"
            style={saving !== null ? { opacity: 0.7 } : undefined}
          >
            {saving === c.minutes ? 'Adding…' : c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
