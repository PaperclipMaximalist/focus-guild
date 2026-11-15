/**
 * Shown while a calendar somewhere still asks for the plan with an old link.
 *
 * Until November 2026 the plan feed link carried the personal access token,
 * which opens the whole account. Those links were switched off at once, with
 * no grace period, so the calendar that used one has gone quiet without
 * saying why. The server notes when one is asked for (`oldFeedLinkSeenAt`),
 * and this says what to do. The last step, a new personal token, is the one
 * that matters: it is what makes the old link worthless, and it is what clears
 * the notice.
 */

import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { oldLinkSeenDate } from '../lib/planFeed';

export function OldFeedLinkNotice({ seenAt, onConnections = false }: { seenAt: string | null; onConnections?: boolean }) {
  const date = oldLinkSeenDate(seenAt);
  if (!date) return null;
  return (
    <div
      role="status"
      className="flex gap-2.5 rounded-(--radius-card) border p-3 text-[13px] leading-snug"
      style={{ borderColor: 'var(--color-gold)', background: 'var(--color-surface)' }}
    >
      <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--color-gold)' }} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-semibold">A calendar is using an old plan link, and it has stopped working.</p>
        <p>
          It last asked on {date}. Old links held your personal token, which can change your whole Guild, so they
          were switched off.
        </p>
        <ol className="list-decimal pl-4">
          <li>Make a new plan link here and add it to your calendar.</li>
          <li>Remove the old Focus Guild calendar there.</li>
          <li>
            Make a new personal token{' '}
            {onConnections ? (
              'under Inbox, below'
            ) : (
              <>
                on <Link to="/connections" className="underline underline-offset-2">Connections</Link>
              </>
            )}
            , and give it to anything that used the old one. This notice then goes away.
          </li>
        </ol>
      </div>
    </div>
  );
}
