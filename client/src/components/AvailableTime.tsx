/**
 * How long today's quests may run for, from now: one slider, on the Route and
 * on Today, so it is never more than a glance away.
 *
 * The planner fills exactly this much time (five minutes between quests) and
 * stops. Dragging only moves the number; letting go reroutes the day. It
 * starts out at whatever the working hours leave, and the arrow puts it back
 * there once it has been moved.
 */

import { useEffect, useRef, useState } from 'react';
import { Hourglass, RotateCcw } from 'lucide-react';
import { useScheduleStore } from '../store/useScheduleStore';

const STEP_MIN = 15;
/** Any amount up to a whole day. */
const MAX_MIN = 24 * 60;
/** Arrow keys come one press at a time: wait this long after the last before rerouting. */
const KEY_SETTLE_MS = 600;

function spell(minutes: number): string {
  if (minutes <= 0) return 'None';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

export function AvailableTime({ className = '' }: { className?: string }) {
  const available = useScheduleStore((s) => s.available);
  const setAvailable = useScheduleStore((s) => s.setAvailable);
  // The value under the thumb while it is being dragged, and when the drag began; null at rest.
  const [drag, setDrag] = useState<{ minutes: number; from: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const settle = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(settle.current), []);

  if (!available) return null;

  const resting = Math.round(available.minutes / STEP_MIN) * STEP_MIN;
  const shown = drag?.minutes ?? resting;
  // At rest the server says when today ends; mid-drag it is the drag's start plus the thumb.
  const ends = drag ? drag.from + drag.minutes * 60_000 : available.until ? Date.parse(available.until) : null;
  const until = ends === null ? '' : new Date(ends).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const commit = async () => {
    window.clearTimeout(settle.current);
    if (drag === null || saving) return;
    if (drag.minutes === resting) {
      setDrag(null);
      return;
    }
    setSaving(true);
    try {
      await setAvailable(drag.minutes);
    } finally {
      setSaving(false);
      setDrag(null);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await setAvailable(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`panel grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3.5 py-2.5 sm:grid-cols-[auto_1fr_auto] ${className}`}
      style={{ opacity: saving ? 0.7 : 1 }}
    >
      <label htmlFor="available-time" className="section-label flex items-center gap-1.5">
        <Hourglass size={14} aria-hidden /> Time available
      </label>
      <input
        id="available-time"
        type="range"
        min={0}
        max={MAX_MIN}
        step={STEP_MIN}
        value={shown}
        disabled={saving}
        onChange={(e) => {
          const minutes = Number(e.target.value);
          setDrag((d) => ({ minutes, from: d?.from ?? Date.now() }));
        }}
        onPointerUp={commit}
        onKeyUp={() => {
          window.clearTimeout(settle.current);
          settle.current = window.setTimeout(commit, KEY_SETTLE_MS);
        }}
        onBlur={commit}
        aria-valuetext={shown > 0 ? `${spell(shown)}, until ${until}` : 'None today'}
        className="order-last col-span-2 h-8 w-full cursor-pointer [accent-color:var(--color-primary)] sm:order-none sm:col-span-1"
      />
      <div className="flex items-center justify-end gap-1.5">
        <div className="text-right">
          <div className="tnum text-[15px] font-bold leading-none text-(--color-text)">{spell(shown)}</div>
          <div className="mt-1 text-[11px] leading-none text-(--color-muted)">{shown > 0 ? `until ${until}` : 'nothing more today'}</div>
        </div>
        {available.set && (
          <button type="button" onClick={reset} disabled={saving} className="icon-btn" title="Back to working hours" aria-label="Back to working hours">
            <RotateCcw size={15} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
