/**
 * Global keyboard shortcuts + a ? help overlay.
 *
 * Shortcuts:
 *   N      — emit `quest-modal:open`. Today.tsx listens; opens the QuestModal.
 *   S      — emit `spin-wheel:open`. Today.tsx listens; opens the SpinWheel.
 *   ?      — toggle this overlay.
 *   G T    — go to /
 *   G F    — go to /feed
 *   G R    — go to /rescue
 *   G Q    — go to /quests
 *   G S    — go to /stats
 *   Escape — close any overlay/modal (handled inside each)
 *
 * Shortcuts are ignored when focus is in an input / textarea / contenteditable.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

function inEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Always handle Escape on the help overlay regardless of focus.
      if (e.key === 'Escape' && helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
        return;
      }
      if (inEditable()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (pendingG) {
        e.preventDefault();
        setPendingG(false);
        const k = e.key.toLowerCase();
        if (k === 't') navigate('/');
        else if (k === 'f') navigate('/feed');
        else if (k === 'r') navigate('/rescue');
        else if (k === 'q') navigate('/quests');
        else if (k === 's') navigate('/stats');
        else if (k === ',' || k === '.') navigate('/settings');
        return;
      }

      switch (e.key) {
        case '?':
          e.preventDefault();
          setHelpOpen((v) => !v);
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('quest-modal:open'));
          break;
        case 's':
        case 'S':
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('spin-wheel:open'));
          break;
        case 'g':
        case 'G':
          e.preventDefault();
          setPendingG(true);
          // Auto-clear after 1s if no follow-up key.
          setTimeout(() => setPendingG(false), 1000);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, pendingG, navigate]);

  return (
    <>
      {/* Discoverable trigger — press ? or click. */}
      <button
        onClick={() => setHelpOpen(true)}
        title="Keyboard shortcuts (?)"
        className="fixed bottom-20 left-4 z-40 h-7 w-7 rounded-full text-xs font-bold transition-opacity opacity-50 hover:opacity-100"
        style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
      >
        ?
      </button>

      {pendingG && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-mono z-50"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
        >
          g …
        </div>
      )}
      <AnimatePresence>
        {helpOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setHelpOpen(false)}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-5"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border p-6"
              style={{ background: 'var(--color-surface2)', borderColor: 'var(--color-border)' }}
            >
              <h2 className="text-base font-bold mb-3" style={{ color: 'var(--color-text)' }}>
                ⌨️ Keyboard shortcuts
              </h2>
              <div className="space-y-1.5 text-sm" style={{ color: 'var(--color-text)' }}>
                <Row k="N" desc="New quest" />
                <Row k="S" desc="Spin the wheel" />
                <Row k="/" desc="Focus search (on Quests page)" />
                <Row k="?" desc="Show this help" />
                <Row k="Esc" desc="Close a modal or overlay" />
                <p className="pt-2 pb-1 text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
                  Navigate (press G then…)
                </p>
                <Row k="G T" desc="Today" />
                <Row k="G F" desc="Guild Feed" />
                <Row k="G R" desc="Rescue" />
                <Row k="G Q" desc="Quests" />
                <Row k="G S" desc="Stats" />
                <Row k="G ," desc="Settings" />
              </div>
              <p className="mt-4 text-xs text-center" style={{ color: 'var(--color-muted)' }}>
                Press <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[0.7rem]">?</kbd> any time to reopen this.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Row({ k, desc }: { k: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <kbd
        className="px-2 py-0.5 rounded font-mono text-xs font-bold"
        style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--color-primary)' }}
      >
        {k}
      </kbd>
      <span className="flex-1 text-right" style={{ color: 'var(--color-muted)' }}>
        {desc}
      </span>
    </div>
  );
}
