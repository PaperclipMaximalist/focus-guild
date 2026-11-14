/**
 * Delete account: the last thing in Settings, Account, on the website and in
 * the app (App Review guideline 5.1.1(v)).
 *
 * A bottom sheet on a phone. The member types DELETE, then presses Delete my
 * account. What happens after the server has erased everything is the
 * caller's `remove` (Settings.tsx): in the app, native/auth.ts forgets the
 * Keychain session and reloads to the sign-in screen; on the website, Clerk is
 * signed out (when it is on) and the page goes to `/`. If the server refuses
 * or cannot be reached, nothing changes and the sheet says so.
 */

import { useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from './tracker/Sheet';
import { CONFIRM_WORD, confirmMatches, deleteFailure } from '../lib/accountDeletion';

export function DeleteAccountDialog({
  open,
  onClose,
  remove,
}: {
  open: boolean;
  onClose: () => void;
  /** Deletes the account and takes the member away; throws if the server did not delete it. */
  remove: () => Promise<void>;
}) {
  const fieldId = useId();
  const whatId = useId();
  const reasonId = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = confirmMatches(typed) && !busy;

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      await remove();
      // `remove` leaves the page; until it has, the sheet stays as it is.
    } catch (err) {
      setProblem(deleteFailure(err));
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    // The next opening starts empty.
    setTyped('');
    setProblem(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Delete your account?"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} disabled={busy} className="btn-quiet min-h-11 disabled:opacity-40">
            Keep my account
          </button>
          <button
            type="button"
            onClick={run}
            // aria-disabled, not disabled: it stays reachable, so a screen reader hears why it does nothing yet.
            aria-disabled={!ready}
            aria-describedby={!confirmMatches(typed) ? reasonId : undefined}
            className="btn-quiet min-h-11 aria-disabled:opacity-40"
            style={{ background: 'var(--color-fire)', color: 'var(--color-on-primary)' }}
          >
            <Trash2 size={16} aria-hidden />
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed">
        <p id={whatId}>
          This deletes every quest, your journal, check-ins, expeditions, trophies and XP, your calendar and AI
          connections, and every signed-in iPhone. It happens at once and cannot be undone.
        </p>
        <div>
          <label htmlFor={fieldId} className="mb-1.5 block text-[13px] font-semibold">
            Type {CONFIRM_WORD} to confirm
          </label>
          <input
            id={fieldId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run();
            }}
            aria-describedby={whatId}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            className="form-input"
          />
          <p id={reasonId} className="mt-1.5 text-[13px] text-(--color-muted)" aria-live="polite">
            {confirmMatches(typed) ? 'Ready. This cannot be undone.' : `Delete my account works once ${CONFIRM_WORD} is typed above.`}
          </p>
        </div>
        {problem && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-fire)' }}>
            {problem}
          </p>
        )}
      </div>
    </Sheet>
  );
}
