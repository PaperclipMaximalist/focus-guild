/**
 * What every dialog and sheet owes a keyboard or screen-reader user:
 *
 * - on open, focus moves inside (to whatever already took it with autoFocus,
 *   else to the dialog itself, so a screen reader reads its name and a phone
 *   keyboard does not pop up);
 * - Tab and Shift+Tab stay inside while it is open;
 * - Esc closes it, and only the topmost one when sheets stack;
 * - on close, focus goes back to what opened it.
 *
 * Usage: `const ref = useDialog(open, onClose)` and put `ref`, `role="dialog"`,
 * `aria-modal="true"`, `tabIndex={-1}` and a name (`aria-labelledby` or
 * `aria-label`) on the dialog's own box, not on the dimmed backdrop.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Open dialogs, oldest first; only the last one answers Esc and Tab. */
const stack: symbol[] = [];

/**
 * The last thing focused outside any dialog. A dialog that autofocuses its
 * own field has already moved focus by the time its effect runs, so this is
 * how it still knows what opened it.
 */
let lastOutside: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && !t.closest('[role="dialog"]')) lastOutside = t;
    },
    true,
  );
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest('[inert]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}

export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  // The latest onClose, without re-running the effect when a parent passes a new function each render.
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  // What opened the dialog. Kept in a ref, not the effect, because React's
  // development double run (StrictMode) runs the effect a second time after
  // focus has already moved inside, and would then lose it.
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = Symbol('dialog');
    stack.push(id);
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (active && !active.closest('[role="dialog"]')) openerRef.current = active;
    else if (!openerRef.current?.isConnected) openerRef.current = lastOutside;

    // The dialog is mounted by now and any autoFocus inside it has run (both
    // happen during the commit, before effects). Not deferred to a frame: a
    // background tab runs no frames, and a fast keyboard would type behind it.
    // The box is kept for the cleanup, which can run after the ref is detached.
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) box.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      const box = ref.current;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !box) return;
      const items = focusables(box);
      if (items.length === 0) {
        e.preventDefault();
        box.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === box || !box.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !box.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    // Capture, so a page's own Esc handler (or a shortcut) does not see the key first.
    window.addEventListener('keydown', onKey, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      // Give focus back, unless the opener has gone (a deleted row) or focus
      // already moved on purpose (into another dialog, say).
      const opener = openerRef.current;
      const now = document.activeElement;
      if (opener && opener.isConnected && (!now || now === document.body || box?.contains(now))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return ref;
}

/** True while any dialog from useDialog is open: single-key shortcuts should stand down. */
export function dialogOpen(): boolean {
  return stack.length > 0;
}
