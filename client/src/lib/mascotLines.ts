/**
 * What the rubber duck says.
 *
 * Rubber-duck debugging is the devcave ritual of explaining a problem to a
 * duck that just listens — so the duck is on your side by definition. Its
 * voice is lowercase terminal chatter: encouraging, a little absurd, and
 * never judgemental. Nothing here scolds; an overdue pile is something to
 * triage together, a dropped item is a good call, an empty day is fine.
 *
 * Lines stay short enough to read at a glance (roughly one line on a phone).
 * `{n}` is replaced with the event's count where one applies.
 */

export type MascotEvent =
  | 'greetMorning'
  | 'greetAfternoon'
  | 'greetEvening'
  | 'greetNight'
  | 'questDone'
  | 'streak'
  | 'levelUp'
  | 'achievement'
  | 'checkIn'
  | 'trackerDone'
  | 'dropped'
  | 'logged'
  | 'undo'
  | 'overdue'
  | 'rescueClear'
  | 'poke';

export type MascotMood = 'idle' | 'happy' | 'party' | 'sleepy' | 'sweat';

interface EventSpec {
  mood: MascotMood;
  /** Higher interrupts lower; equal or lower waits its turn. */
  priority: 1 | 2 | 3;
  lines: string[];
}

export const MASCOT_EVENTS: Record<MascotEvent, EventSpec> = {
  greetMorning: {
    mood: 'happy',
    priority: 1,
    lines: [
      'morning. one small thing first?',
      'coffee loaded. duck loaded. quest?',
      'fresh session. no merge conflicts yet.',
    ],
  },
  greetAfternoon: {
    mood: 'idle',
    priority: 1,
    lines: [
      'afternoon slump is real. pick the easy one.',
      'still here. still believing in you.',
      'half the day left. that’s a lot of day.',
    ],
  },
  greetEvening: {
    mood: 'idle',
    priority: 1,
    lines: [
      'evening shift. keep it light.',
      'wind-down mode. one tiny thing, then rest.',
    ],
  },
  greetNight: {
    mood: 'sleepy',
    priority: 1,
    lines: [
      'late session? quack softly.',
      'it’s late. future you says thanks for sleeping.',
    ],
  },
  questDone: {
    mood: 'happy',
    priority: 2,
    lines: [
      'shipped it. i saw. quack.',
      'that’s a commit. tiny but real.',
      'one down. build is green.',
      'you did the thing. i did nothing. teamwork.',
      'closed. the backlog fears you.',
      'nice. that counts, even if it was small.',
    ],
  },
  streak: {
    mood: 'party',
    priority: 2,
    lines: [
      '{n} days in a row. uptime looking good.',
      '{n}-day streak. i’m telling the other ducks.',
    ],
  },
  levelUp: {
    mood: 'party',
    priority: 3,
    lines: [
      'LEVEL UP. doing a tiny victory lap.',
      'new rank unlocked. i put on my good hat.',
    ],
  },
  achievement: {
    mood: 'party',
    priority: 3,
    lines: [
      'achievement unlocked. framing it for the pond.',
      'a trophy! i can’t hold it. no hands. proud anyway.',
    ],
  },
  checkIn: {
    mood: 'happy',
    priority: 2,
    lines: [
      'energy logged. i’ll plan around it.',
      'thanks for checking in. that’s the hardest part.',
    ],
  },
  trackerDone: {
    mood: 'party',
    priority: 2,
    lines: [
      'long quest closed. that one took real stamina.',
      'done done. not “almost done”. done.',
    ],
  },
  dropped: {
    mood: 'idle',
    priority: 1,
    lines: [
      'dropping is allowed. lighter duck, faster duck.',
      'good call. not everything deserves a sprint.',
      'deleted from the roadmap. no regrets.',
    ],
  },
  logged: {
    mood: 'happy',
    priority: 1,
    lines: [
      'noted. brain RAM freed.',
      'written down. you can stop holding it now.',
      'logged. future you will find it.',
    ],
  },
  undo: {
    mood: 'idle',
    priority: 1,
    lines: ['ctrl+z’d. no harm done.', 'reverted. like it never happened.'],
  },
  overdue: {
    mood: 'sweat',
    priority: 2,
    lines: [
      '{n} stragglers. we triage, we don’t panic.',
      'overdue isn’t failure. pick one and nudge it.',
      '{n} late ones. push a date, finish one, or drop one. all valid.',
    ],
  },
  rescueClear: {
    mood: 'party',
    priority: 3,
    lines: ['zero overdue. the pond is calm.', 'all clear. i can finally float in peace.'],
  },
  poke: {
    mood: 'happy',
    priority: 3,
    lines: [
      'quack.',
      'you’re doing better than you think.',
      'explain the problem to me. i’m listening.',
      'rubber duck mode: engaged.',
      'hydrate. then one tiny step.',
      'i believe in you. also in bread.',
      'stuck? make the next step smaller.',
      'squeak. that was encouragement.',
      'starting is the hard part. you’re allowed to start badly.',
    ],
  },
};

/** Greeting for the hour of day, local time. */
export function greetingFor(hour: number): MascotEvent {
  if (hour >= 5 && hour < 12) return 'greetMorning';
  if (hour >= 12 && hour < 17) return 'greetAfternoon';
  if (hour >= 17 && hour < 22) return 'greetEvening';
  return 'greetNight';
}

/** Pick a line, avoiding the one said last time where there's a choice. */
export function pickLine(event: MascotEvent, n: number | undefined, previous: string | null): string {
  const pool = MASCOT_EVENTS[event].lines.map((l) => l.replace('{n}', String(n ?? '')));
  const fresh = pool.length > 1 ? pool.filter((l) => l !== previous) : pool;
  return fresh[Math.floor(Math.random() * fresh.length)]!;
}
