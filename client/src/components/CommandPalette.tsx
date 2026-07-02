/**
 * Command palette — ⌘K / Ctrl+K.
 *
 * A fast fuzzy launcher for navigation + actions. Built for the ADHD
 * "capture it / do it NOW" reflex: one chord, type a few letters, Enter.
 *
 * Actions are plain objects; navigation uses react-router, the rest dispatch
 * the same custom events the keyboard-shortcut layer already listens for, or
 * flip client settings directly. Mounted once inside the router in App.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { isSfxEnabled, setSfxEnabled, sfxClick } from '../lib/sfx';
import { isRankThemeEnabled, setRankThemeEnabled } from '../lib/theme';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  keywords: string;
  run: () => void;
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q); // substring = strong
  // Subsequence match (chars in order).
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) qi += 1;
  }
  return qi === q.length ? 10 : -1;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => { navigate(path); };
    return [
      { id: 'new-quest', label: 'New quest', hint: 'N', icon: '⚔️', keywords: 'add create task todo',
        run: () => window.dispatchEvent(new CustomEvent('quest-modal:open')) },
      { id: 'spin', label: 'Spin the Wheel', hint: 'S', icon: '🎲', keywords: 'random pick roll',
        run: () => window.dispatchEvent(new CustomEvent('spin-wheel:open')) },
      { id: 'go-today', label: 'Go to Today', icon: '🏠', keywords: 'home dashboard', run: go('/') },
      { id: 'go-feed', label: 'Go to Guild Feed', icon: '📅', keywords: 'schedule plan timeline', run: go('/feed') },
      { id: 'go-quests', label: 'Go to Quests', icon: '📜', keywords: 'list all tasks', run: go('/quests') },
      { id: 'go-rescue', label: 'Go to Rescue', icon: '🚑', keywords: 'overdue triage late', run: go('/rescue') },
      { id: 'go-stats', label: 'Go to Stats', icon: '📊', keywords: 'progress charts xp', run: go('/stats') },
      { id: 'go-trophies', label: 'Open Trophy Room', icon: '🏆', keywords: 'achievements badges awards', run: go('/trophies') },
      { id: 'go-settings', label: 'Open Settings', icon: '⚙️', keywords: 'config tune preferences', run: go('/settings') },
      { id: 'go-checkin', label: 'Daily check-in', icon: '⚡', keywords: 'energy mood available', run: go('/checkin') },
      { id: 'toggle-sound', label: `${isSfxEnabled() ? 'Mute' : 'Enable'} sound effects`, icon: '🔊', keywords: 'audio mute volume',
        run: () => setSfxEnabled(!isSfxEnabled()) },
      { id: 'toggle-theme', label: `${isRankThemeEnabled() ? 'Disable' : 'Enable'} rank theming`, icon: '🎨', keywords: 'color accent skin',
        run: () => setRankThemeEnabled(!isRankThemeEnabled()) },
    ];
  }, [navigate]);

  const results = useMemo(() => {
    return commands
      .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.label), fuzzyScore(query, c.keywords)) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.c);
  }, [commands, query]);

  // Open on ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  const choose = (cmd: Command | undefined) => {
    if (!cmd) return;
    setOpen(false);
    sfxClick();
    // Defer so the palette unmounts before navigation/modal dispatch.
    setTimeout(() => cmd.run(), 0);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[400] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.97, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, y: -8 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: 'var(--color-surface2)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-base opacity-60">⌘</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Type a command or jump to…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--color-text)' }}
              />
              <kbd className="rounded px-1.5 py-0.5 text-[0.62rem] font-mono" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-muted)' }}>
                esc
              </kbd>
            </div>
            <div className="max-h-[52vh] overflow-y-auto py-1.5">
              {results.length === 0 && (
                <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
                  No matching command.
                </div>
              )}
              {results.map((c, i) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(c)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{ background: i === active ? 'rgba(139,92,246,0.16)' : 'transparent' }}
                >
                  <span className="text-lg leading-none">{c.icon}</span>
                  <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{c.label}</span>
                  {c.hint && (
                    <kbd className="rounded px-1.5 py-0.5 text-[0.62rem] font-mono" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-muted)' }}>
                      {c.hint}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
