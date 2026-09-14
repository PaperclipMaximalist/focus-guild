/**
 * EndOfDayReflection — banner shown on Today after working hours end,
 * IF the user has completed ≥1 quest today and hasn't already reflected.
 *
 * Saves to localStorage keyed by date. No server round-trip yet.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Annoyed, Frown, Laugh, Meh, Moon, Smile } from 'lucide-react';

const STORAGE_KEY = 'focusGuild.reflections';
const END_HOUR = 18; // matches default workingHours.endHour

interface StoredReflection {
  date: string; // yyyy-mm-dd
  text: string;
  rating: 1 | 2 | 3 | 4 | 5;
  savedAt: string;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadAll(): Record<string, StoredReflection> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveOne(r: StoredReflection) {
  const all = loadAll();
  all[r.date] = r;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

interface Props {
  /** Completions today — only render if > 0. */
  completionsToday: number;
}

export function EndOfDayReflection({ completionsToday }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [text, setText] = useState('');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [saved, setSaved] = useState(false);
  const [hour, setHour] = useState(new Date().getHours());

  // Tick every minute to catch when we cross END_HOUR without a refresh.
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  const key = todayKey();
  const alreadySaved = !!loadAll()[key];

  // Visibility gate.
  if (completionsToday === 0) return null;
  if (hour < END_HOUR) return null;
  if (alreadySaved || saved) {
    return (
      <div
        className="mt-3 rounded-(--radius-card) border px-4 py-2.5 text-sm"
        style={{
          background: 'color-mix(in srgb, var(--color-green) 6%, transparent)',
          borderColor: 'color-mix(in srgb, var(--color-green) 30%, transparent)',
          color: 'var(--color-muted)',
        }}
      >
        <span className="inline-flex items-center gap-2"><Moon size={14} aria-hidden /> Reflection saved for today. Rest well.</span>
      </div>
    );
  }
  if (dismissed) return null;

  // Faces from low to high; the label carries the meaning, not the drawing.
  const RATINGS = [null, { Icon: Frown, label: 'Rough' }, { Icon: Annoyed, label: 'Meh' }, { Icon: Meh, label: 'Okay' }, { Icon: Smile, label: 'Good' }, { Icon: Laugh, label: 'Great' }] as const;

  const handleSave = () => {
    const t = text.trim();
    if (!t) return;
    saveOne({ date: key, text: t, rating, savedAt: new Date().toISOString() });
    setSaved(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 rounded-(--radius-card) border p-4"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-start gap-2.5">
          <Moon size={20} className="mt-0.5 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              End-of-day reflection
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              One line: what went well, what to carry into tomorrow?
            </p>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Shipped the auth refactor; carry over the docs polish."
              rows={2}
              className="mt-2 w-full rounded-lg border bg-white/5 px-3 py-2 text-sm outline-none transition-colors"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />

            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>How'd today feel?</span>
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className="text-lg transition-transform"
                  style={{
                    opacity: rating === n ? 1 : 0.4,
                    transform: rating === n ? 'scale(1.2)' : 'scale(1)',
                  }}
                  aria-label={`Rating ${n}: ${RATINGS[n]!.label}`}
                  aria-pressed={rating === n}
                  title={RATINGS[n]!.label}
                >
                  {(() => { const R = RATINGS[n]!.Icon; return <R size={22} aria-hidden />; })()}
                </button>
              ))}
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setDismissed(true)}
                className="text-xs px-3 py-1 rounded-md"
                style={{ color: 'var(--color-muted)' }}
              >
                Maybe later
              </button>
              <button
                onClick={handleSave}
                disabled={!text.trim()}
                className="text-xs px-3 py-1 rounded-md font-semibold text-(--color-on-primary) disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
