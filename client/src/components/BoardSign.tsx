/**
 * The yellow sign over a board: what the board is, and the time.
 *
 * The clock is the one place the split-flap idea is allowed to move: when the
 * minute changes, the digits that changed turn over once. Nothing else on the
 * board animates by itself.
 */

import { useEffect, useState } from 'react';

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      // Wake just after the next minute starts, so the sign is never a minute behind.
      timer = setTimeout(() => {
        setNow(new Date());
        arm();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    arm();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** HH:MM in the reader's own 12- or 24-hour habit, each character its own flap. */
export function BoardClock() {
  const now = useMinute();
  const text = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <time dateTime={now.toISOString()} className="tnum text-[19px] font-bold leading-none" aria-label={`The time is ${text}`}>
      {[...text].map((ch, i) => (
        // Keyed by its own value: a character that changes is a new element, so it flips; one that stays, stays.
        <span key={`${i}${ch}`} className="flap" aria-hidden>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </time>
  );
}

export function BoardSign({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="board-sign">
      <h1 className="min-w-0 flex-1 truncate">{title}</h1>
      {children}
      <BoardClock />
    </div>
  );
}
