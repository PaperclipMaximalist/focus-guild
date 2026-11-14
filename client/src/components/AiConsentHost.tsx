/**
 * The prompt that asks before the member's text goes to an AI provider.
 * Mounted once in App.tsx; lib/aiConsent.ts calls it through setConsentAsker
 * and waits for the answer. Requests that arrive while one is showing wait
 * their turn.
 *
 * A bottom sheet on a phone (components/tracker/Sheet.tsx, which brings
 * useDialog's focus trap, Esc and focus return). Closing it any other way
 * than Send is Not now.
 */

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Sheet } from './tracker/Sheet';
import { AI_FEATURES, setConsentAsker, type AiAnswerer, type AiFeature } from '../lib/aiConsent';
import { legalHref } from '../lib/legalLinks';

interface Ask {
  feature: AiFeature;
  who: AiAnswerer;
  answer: (allowed: boolean) => void;
  /** The button that asked. It can sit inside another dialog (Break down, in a quest's sheet), which useDialog alone would not return focus into. */
  opener: HTMLElement | null;
}

export function AiConsentHost() {
  const [queue, setQueue] = useState<Ask[]>([]);
  // The latest queue for the unmount cleanup, which must answer whatever is still waiting.
  const queueRef = useRef<Ask[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const off = setConsentAsker(
      (feature, who) =>
        new Promise<boolean>((resolve) => {
          const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setQueue((q) => [...q, { feature, who, answer: resolve, opener }]);
        }),
    );
    return () => {
      off();
      // Nobody left to ask: everything still waiting is a no.
      for (const ask of queueRef.current) ask.answer(false);
    };
  }, []);

  const current = queue[0] ?? null;
  const reply = (allowed: boolean) => {
    if (!current) return;
    current.answer(allowed);
    setQueue((q) => q.slice(1));
    if (queue.length > 1) return; // The next question takes the sheet, and focus stays in it.
    // After the sheet's own focus return has run. A button that went busy
    // (disabled) cannot take focus: its dialog, if it is in one, takes it.
    const { opener } = current;
    window.setTimeout(() => {
      if (!opener?.isConnected) return;
      const target = opener.matches(':disabled') ? opener.closest<HTMLElement>('[role="dialog"]') : opener;
      target?.focus({ preventScroll: true });
    }, 0);
  };

  return (
    <Sheet
      open={current !== null}
      onClose={() => reply(false)}
      title={current ? `Send to ${current.who.company}?` : ''}
      footer={
        current && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => reply(false)}
              aria-label={`Not now: do not send to ${current.who.company}`}
              className="btn-quiet min-h-11"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => reply(true)}
              aria-label={`Send to ${current.who.company} for ${AI_FEATURES[current.feature].name}`}
              className="btn-primary min-h-11"
            >
              <Send size={16} aria-hidden />
              Send to {current.who.company}
            </button>
          </div>
        )
      }
    >
      {current && <ConsentText feature={current.feature} who={current.who} />}
    </Sheet>
  );
}

function ConsentText({ feature, who }: { feature: AiFeature; who: AiAnswerer }) {
  const f = AI_FEATURES[feature];
  const answers =
    who.product === who.company
      ? `It answers with ${who.own ? 'your own key' : 'the Guild’s own key'}.`
      : `${who.product} answers, with ${who.own ? 'your own key' : 'the Guild’s own key, because you have not connected one'}.`;
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      <p>
        {f.lead} {who.company} {f.sends}.
      </p>
      <p className="text-(--color-muted)">{answers}</p>
      <p className="text-(--color-muted)">
        {who.company}’s own terms apply to what it receives.{' '}
        {/* A new tab on the website, so the request waiting here is not lost; the browser sheet in the app. */}
        <a
          href={legalHref('privacy')}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-(--color-text) underline underline-offset-2"
        >
          Privacy policy
        </a>
      </p>
      <p className="text-[13px] text-(--color-muted)">
        The Guild asks once for each AI button. Your AI, under Advanced, can make it ask again.
      </p>
    </div>
  );
}
