/**
 * The first thing a new member sees on Today: what the Guild does and the
 * three things to do, as a checklist that ticks itself.
 *
 * Without it, a fresh account opened on a greeting, a prompt to plot an
 * empty route, a prompt to do a "fuel check", a quick-add box and a panel of
 * zeros, with nothing saying which came first or what the words meant.
 *
 * Shown until the member earns their first XP (their first completed quest
 * or logged hour), or until they hide it. Each step explains its own word.
 */

import { Link } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';

import { hideWelcome } from '../lib/welcome';

interface Props {
  hasQuests: boolean;
  checkedIn: boolean;
  onHide: () => void;
  /** The quick-add box, kept inside step 1 (on a phone, "the box below" was off screen); it stays after the step ticks, so a run of jots keeps its focus. */
  jot: React.ReactNode;
}

export function WelcomeGuide({ hasQuests, checkedIn, onHide, jot }: Props) {
  const [hiding, setHiding] = useState(false);
  const hide = () => {
    setHiding(true);
    hideWelcome();
    onHide();
  };
  if (hiding) return null;

  const steps = [
    {
      done: hasQuests,
      title: 'Jot down what is on your mind',
      body: (
        <>
          One line each. Add a length or a deadline if you know it, like{' '}
          <span className="whitespace-nowrap font-semibold text-(--color-text)">Email Sam 15m by fri</span>.
        </>
      ),
      extra: jot,
    },
    {
      done: checkedIn,
      title: 'Do a fuel check',
      body: 'Say how much energy and free time you have today, so the plan fits you.',
      to: '/checkin',
      cta: 'Fuel check',
    },
    {
      done: false,
      title: 'Follow your route',
      body: 'Your route is today’s plan: your quests in order, one stop at a time. Tick a quest when it is done to earn XP.',
      to: '/feed',
      cta: 'See the route',
    },
  ];
  const next = steps.findIndex((s) => !s.done);

  return (
    <section aria-labelledby="welcome-title" className="panel relative p-4 sm:p-5">
      <button type="button" onClick={hide} className="icon-btn absolute right-2 top-2" aria-label="Hide the welcome guide">
        <X size={16} aria-hidden />
      </button>
      <h2 id="welcome-title" className="pr-10 text-[17px] font-bold leading-snug">
        Welcome to the Guild
      </h2>
      <p className="mt-1 text-sm text-(--color-muted)">
        Focus Guild turns your to-do list into a plan for today that fits your energy, and keeps score so finishing
        things feels like progress. Three steps to start:
      </p>

      <ol className="mt-4 flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3" aria-current={i === next ? 'step' : undefined}>
            <span
              className="tnum mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold"
              style={
                s.done
                  ? { borderColor: 'var(--color-green)', background: 'var(--color-green)', color: 'var(--color-on-primary)' }
                  : i === next
                    ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                    : { borderColor: 'var(--color-border-strong)', color: 'var(--color-muted)' }
              }
              aria-hidden
            >
              {s.done ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={s.done ? { color: 'var(--color-muted)' } : undefined}>
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
              </p>
              {!s.done && <p className="mt-0.5 text-[13px] leading-relaxed text-(--color-muted)">{s.body}</p>}
              {/* Full width under the number, so the box has room on a phone. */}
              {'extra' in s && <div className="-ml-9">{s.extra}</div>}
              {!s.done && 'to' in s && s.to && (
                <Link to={s.to} className="btn-quiet mt-2 h-9 min-h-0 px-3 text-xs">
                  {s.cta} <ChevronRight size={14} aria-hidden />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
