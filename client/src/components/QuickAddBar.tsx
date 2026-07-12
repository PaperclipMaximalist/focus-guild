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
        icon: '⚔️',
        title: `Quest added: ${parsed.title}`,
        sub: parsed.chips.map((c) => `${c.icon} ${c.label}`).join('  ') || 'Slotted into your feed.',
        variant: 'xp',
      });
      setText('');
    } catch (e) {
      pushToast({ icon: '⚠️', title: 'Could not add quest', sub: String(e), variant: 'xp' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-5 rounded-(--radius-card) border p-3"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg shrink-0">⚡</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder={'Quick add — try "Write report 2h by fri #work !high"'}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--color-text)' }}
          disabled={busy}
        />
        <button
          onClick={() => void submit()}
          disabled={!ready || busy}
          className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold text-white transition disabled:opacity-30"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy ? '…' : 'Add ⏎'}
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
              <span className="text-[0.65rem]" style={{ color: 'var(--color-muted)' }}>
                {parsed.title || '(no title yet)'}
              </span>
              {parsed.chips.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
                  style={{ background: 'rgba(139,92,246,0.14)', color: 'var(--color-primary)' }}
                >
                  {c.icon} {c.label}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
