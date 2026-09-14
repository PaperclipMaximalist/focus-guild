/**
 * Parking lot — zero-friction capture.
 *
 * One field, no required anything, no category, no date. The whole point is
 * that a thought costs one tap to store and can be sorted out later; asking
 * for a domain here would defeat it. Promoting an entry is what turns it into
 * a real item with a code.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TrackerDomain } from '../../lib/api';
import { useTrackerStore } from '../../store/useTrackerStore';
import { useToastStore } from '../Toasts';
import { fieldClass, fieldStyle } from './Sheet';
import { sfxClick, sfxXp } from '../../lib/sfx';
import { ArrowUp, TriangleAlert } from 'lucide-react';

export function ParkingLot({ domains }: { domains: TrackerDomain[] }) {
  const { parkingLot, addParkingLot, deleteParkingLot, promoteParkingLot } = useTrackerStore();
  const pushToast = useToastStore((s) => s.push);
  const [text, setText] = useState('');
  const [promoting, setPromoting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    const value = text.trim();
    if (!value) return;
    // Clear immediately so a fast second thought can go straight in.
    setText('');
    try {
      await addParkingLot(value);
      sfxClick();
    } catch (err) {
      setText(value);
      pushToast({ title: 'Could not capture', sub: String(err), icon: TriangleAlert, variant: 'error' });
    }
  };

  const promote = async (id: string, domainId: string | null) => {
    setBusy(true);
    try {
      const item = await promoteParkingLot(id, domainId);
      setPromoting(null);
      sfxXp();
      pushToast({
        title: `Promoted to ${item.code}`,
        sub: item.title,
        icon: ArrowUp,
        variant: 'xp',
      });
    } catch (err) {
      pushToast({ title: 'Could not promote', sub: String(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') capture();
          }}
          placeholder="Anything, unsorted…"
          enterKeyHint="done"
          className={fieldClass}
          style={fieldStyle}
          aria-label="Capture a thought"
        />
        <button
          type="button"
          onClick={capture}
          disabled={!text.trim()}
          className="shrink-0 rounded-lg px-4 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          Add
        </button>
      </div>

      {parkingLot.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing parked. Anything half-formed goes here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {parkingLot.map((entry) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-(--radius-card) border p-3"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                <p className="text-sm leading-snug">{entry.text}</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                  {new Date(entry.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {entry.promotedToCode && (
                    <span style={{ color: 'var(--color-teal)' }}> · became {entry.promotedToCode}</span>
                  )}
                </p>

                {promoting === entry.id ? (
                  <div className="mt-2.5">
                    <p className="mb-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                      Into which domain?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => promote(entry.id, null)}
                        className="rounded-md px-3 py-1.5 text-xs font-semibold"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text)' }}
                      >
                        Unsorted
                      </button>
                      {domains.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          disabled={busy}
                          onClick={() => promote(entry.id, d.id)}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold"
                          style={{ background: `${d.color}26`, color: d.color }}
                        >
                          {d.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPromoting(null)}
                        className="rounded-md px-3 py-1.5 text-xs"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex items-center gap-2">
                    {!entry.promotedToCode && (
                      <button
                        type="button"
                        onClick={() => setPromoting(entry.id)}
                        className="rounded-md px-3 py-1.5 text-xs font-semibold"
                        style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}
                      >
                        <span className="inline-flex items-center gap-1.5"><ArrowUp size={12} aria-hidden /> Promote</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteParkingLot(entry.id)}
                      className="ml-auto rounded-md px-3 py-1.5 text-xs font-semibold"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
                    >
                      Discard
                    </button>
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
