/**
 * QuickAddBar — zero-friction natural-language quest capture.
 *
 *   "Write report 2h by fri #work !high" ⏎
 *
 * Lives at the top of Today. Parses as you type and shows chips for what
 * it recognized (duration / deadline / priority / tags), so there's no
 * mystery about what Enter will create. The created quest auto-slots into
 * the schedule via useQuestStore.add's insert hook.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuestStore } from '../store/useQuestStore';
import { useToastStore } from './Toasts';
import { parseQuickAdd } from '../lib/quickAdd';
import { sfxClick } from '../lib/sfx';
import { CornerDownLeft, Swords, TriangleAlert, Plus } from 'lucide-react';

export function QuickAddBar() {
  const add = useQuestStore((s) => s.add);
  const pushToast = useToastStore((s) => s.push);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const ready = parsed.title.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await add({
        title: parsed.title,
        estimatedMinutes: parsed.estimatedMinutes ?? 30,
        deadline: parsed.deadline ?? null,
        ...(parsed.priorityTier ? { priorityTier: parsed.priorityTier } : {}),
        tags: parsed.tags,
      });
      sfxClick();
      pushToast({
        icon: Swords,
        title: `Quest added: ${parsed.title}`,
        sub: parsed.chips.map((c) => c.label).join(' · ') || 'Slotted into your feed.',
        variant: 'xp',
      });
      setText('');
    } catch (e) {
      pushToast({ icon: TriangleAlert, title: 'Could not add quest', sub: String(e), variant: 'xp' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-(--radius-card) border border-(--color-border-strong) bg-(--color-bg) py-2 pl-3.5 pr-2 transition-colors focus-within:border-(--color-primary)">
      <div className="flex items-center gap-2.5">
        <Plus size={18} className="shrink-0 text-(--color-muted)" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder="Add a quest… 2h by fri !high"
          aria-label="Quick add a quest"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-(--color-muted)"
          style={{ color: 'var(--color-text)' }}
          disabled={busy}
        />
        <button
          onClick={() => void submit()}
          disabled={!ready || busy}
          className="btn-primary min-h-9 shrink-0 px-3 text-xs"
          style={!ready ? { visibility: 'hidden' } : undefined}
        >
          {busy ? '…' : <span className="inline-flex items-center gap-1">Add <CornerDownLeft size={12} aria-hidden /></span>}
        </button>
      </div>

      {/* Live parse preview */}
      <AnimatePresence>
        {text.trim() && parsed.chips.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-7">
              <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                {parsed.title || '(no title yet)'}
              </span>
              {parsed.chips.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}
                >
                  <c.icon size={11} aria-hidden /> {c.label}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
