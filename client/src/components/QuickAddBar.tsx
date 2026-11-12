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
import { parseQuickAdd, questFields } from '../lib/quickAdd';
import { sfxClick } from '../lib/sfx';
import { findDuplicate } from '../lib/duplicates';
import { formatDeadline } from '../lib/formatters';
import { CornerDownLeft, Swords, TriangleAlert, Plus } from 'lucide-react';

export function QuickAddBar() {
  const add = useQuestStore((s) => s.add);
  const removeQuest = useQuestStore((s) => s.remove);
  const quests = useQuestStore((s) => s.quests);
  const rounds = useQuestStore((s) => s.recurring);
  const pushToast = useToastStore((s) => s.push);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const ready = parsed.title.length > 0;

  // Already on the list: an active quest, or failing that a round. It never blocks adding.
  const dupQuest = useMemo(() => findDuplicate(parsed.title, quests), [parsed.title, quests]);
  const dupRound = useMemo(() => (dupQuest ? undefined : findDuplicate(parsed.title, rounds)), [parsed.title, dupQuest, rounds]);
  const dup = dupQuest ?? dupRound;
  const dupNote = dup
    ? `Already on your list: “${dup.title}”${dupQuest ? (dupQuest.deadline ? ` · ${formatDeadline(dupQuest.deadline)}` : '') : ' · a round'}`
    : null;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const created = await add(questFields(parsed));
      sfxClick();
      if (dup) {
        pushToast({
          icon: Swords,
          title: `Added again: ${parsed.title}`,
          sub: 'You already had one. Undo to take this one back.',
          variant: 'xp',
          action: {
            label: 'Undo',
            run: () => {
              removeQuest(created.id).catch(() => {
                pushToast({ icon: TriangleAlert, title: 'Could not undo that', sub: 'The quest is still on your list.', variant: 'error' });
              });
            },
          },
        });
      } else {
        pushToast({
          icon: Swords,
          title: `Quest added: ${parsed.title}`,
          sub: parsed.chips.map((c) => c.label).join(' · ') || 'Slotted into your feed.',
          variant: 'xp',
        });
      }
      setText('');
    } catch {
      pushToast({ icon: TriangleAlert, title: 'Could not add that quest', sub: 'Your text is still in the box. Try again.', variant: 'error' });
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
          placeholder="Jot a quest… 2h by fri !high"
          aria-label="Jot down a quest"
          aria-describedby={text.trim() ? 'quick-add-preview' : undefined}
          className="h-9 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-(--color-muted)"
          style={{ color: 'var(--color-text)' }}
          enterKeyHint="done"
          // Read-only while saving, not disabled: a disabled field drops focus, and the next jot could not be typed straight away.
          readOnly={busy}
          aria-busy={busy}
        />
        <button
          onClick={() => void submit()}
          disabled={!ready || busy}
          type="button"
          className="btn-primary min-h-9 shrink-0 px-3 text-xs"
          style={!ready ? { visibility: 'hidden' } : undefined}
        >
          {busy ? 'Adding…' : <span className="inline-flex items-center gap-1">Add <CornerDownLeft size={12} aria-hidden /></span>}
        </button>
      </div>

      {/* Live parse preview */}
      <AnimatePresence>
        {text.trim() && (parsed.chips.length > 0 || parsed.warnings.length > 0 || dupNote) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div id="quick-add-preview" className="mt-2 flex flex-wrap items-center gap-1.5 pl-7">
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
            {dupNote && (
              <p className="mt-1 pl-7 text-[0.65rem]" style={{ color: 'var(--color-gold)' }}>
                {dupNote}
              </p>
            )}
            {parsed.warnings.map((w) => (
              <p key={w} className="mt-1 pl-7 text-[0.65rem]" style={{ color: 'var(--color-gold)' }}>
                {w}
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
