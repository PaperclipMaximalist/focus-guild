/**
 * Writes api.json: the sample day every line is photographed against.
 *
 *   node design/lines/fixtures/build.mjs
 *
 * A tidy, believable day instead of whatever is in the development account:
 * a block in progress, a few quests with different deadlines, three
 * stragglers, rounds, four things done. The clock is fixed at `NOW`, an
 * evening, because every line is a night scene.
 *
 * The shapes match what the API returns (recorded with
 * `npm run line:shoot night record`, then rewritten here by hand). If the API
 * changes shape, record again, compare, and update this file.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Friday 9 October 2026, 7:40 in the evening, Pacific time. */
const NOW = '2026-10-10T02:40:00.000Z';
const TZ = 'America/Vancouver';
const USER = 'sample-user';
const at = (h, m = 0, day = 0) => new Date(Date.UTC(2026, 9, 9 + day, h + 7, m)).toISOString();
const ok = (data, status = 200) => ({ status, body: { success: true, data } });

let n = 0;
const quest = (title, o = {}) => ({
  id: `q${(n += 1)}`,
  userId: USER,
  title,
  estimatedMinutes: 60,
  mentalLoad: 5,
  impact: 6,
  deadline: null,
  status: 'ACTIVE',
  parentQuestId: null,
  tags: [],
  tediousness: null,
  category: 'deep_work',
  preferredHour: null,
  minChunkMin: null,
  maxChunkMin: null,
  setupCost: null,
  urgencyMult: 1,
  isRecurring: false,
  priorityTier: 'MED',
  actualMinutes: null,
  completedAt: null,
  createdAt: at(9, 0, -6),
  updatedAt: at(9, 0, -1),
  priorityScore: 5,
  subQuestTotal: 0,
  subQuestDone: 0,
  ...o,
});

const active = [
  quest('Draft the methods section', { estimatedMinutes: 120, mentalLoad: 8, impact: 9, priorityTier: 'HIGH', deadline: at(23, 0), tags: ['thesis'], priorityScore: 8.4, subQuestTotal: 4, subQuestDone: 1 }),
  quest('Reply to the landlord about the lease', { estimatedMinutes: 15, mentalLoad: 3, impact: 7, category: 'comms', deadline: at(12, 0, 1), priorityScore: 7.1 }),
  quest('Fix the flaky login test', { estimatedMinutes: 90, mentalLoad: 7, impact: 8, priorityTier: 'HIGH', deadline: at(17, 0, 3), tags: ['work'], priorityScore: 6.8 }),
  quest('Sketch three poster ideas', { estimatedMinutes: 45, mentalLoad: 4, impact: 5, category: 'creative', deadline: at(18, 0, 5), tags: ['studio'], priorityScore: 5.2 }),
  quest('File the expense report', { estimatedMinutes: 30, mentalLoad: 2, impact: 5, category: 'admin', tediousness: 0.8, deadline: at(17, 0, 6), priorityScore: 4.9 }),
  quest('Read chapter 6 of the statistics text', { estimatedMinutes: 75, mentalLoad: 6, impact: 6, tags: ['thesis'], priorityScore: 4.4 }),
  quest('Plan the weekend hike', { estimatedMinutes: 25, mentalLoad: 2, impact: 4, category: 'admin', priorityTier: 'LOW', priorityScore: 3.1 }),
];
const [methods, landlord, loginTest, posters, expenses, stats] = active;

const rescue = [
  quest('Renew the library books', { status: 'RESCUE', estimatedMinutes: 10, category: 'admin', deadline: at(17, 0, -3) }),
  quest('Send the invoice for September', { status: 'RESCUE', estimatedMinutes: 20, category: 'admin', priorityTier: 'HIGH', deadline: at(12, 0, -1) }),
  quest('Call the dentist', { status: 'RESCUE', estimatedMinutes: 10, category: 'comms', deadline: at(15, 0, 0) }),
].map(({ priorityScore, subQuestTotal, subQuestDone, ...q }) => q);

const recurring = [
  quest('Stretch for ten minutes', { isRecurring: true, estimatedMinutes: 10, mentalLoad: 1, preferredHour: 8, doneToday: true }),
  quest('Clear the inbox to zero', { isRecurring: true, estimatedMinutes: 20, mentalLoad: 3, category: 'comms', doneToday: true }),
  quest('Twenty minutes of Spanish', { isRecurring: true, estimatedMinutes: 20, mentalLoad: 4, preferredHour: 21, doneToday: false }),
].map(({ priorityScore, subQuestTotal, subQuestDone, ...q }) => q);

const completed = [
  ['Book the train tickets', 13, 5],
  ['Outline the methods section', 14, 40],
  ['Water the plants', 16, 10],
  ['Push the build to staging', 17, 55],
].map(([title, h, m]) => {
  const { priorityScore, subQuestTotal, subQuestDone, ...q } = quest(title, { status: 'COMPLETE', completedAt: at(h, m), estimatedMinutes: 30 });
  return q;
});

let b = 0;
const block = (type, start, end, o = {}) => ({
  id: `b${(b += 1)}`,
  start,
  end,
  durationMin: Math.round((new Date(end) - new Date(start)) / 60_000),
  type,
  taskId: null,
  locked: false,
  note: null,
  reason: null,
  ...o,
});
const work = (q, start, end, why) =>
  block('work', start, end, { taskId: q.id, reason: why, note: JSON.stringify({ term: 'urgency', sign: '+', total: 1.2, why }) });

const schedule = [
  work(loginTest, at(15, 0), at(15, 50), 'High priority · sharp hours'),
  block('break', at(15, 50), at(16, 0)),
  work(expenses, at(16, 0), at(16, 30), 'Tedious · low-energy slot'),
  block('fixed', at(18, 0), at(18, 20), { locked: true, note: 'Daily: Clear the inbox to zero' }),
  // In progress at NOW.
  work(methods, at(19, 15), at(20, 5), 'Due tonight'),
  block('break', at(20, 5), at(20, 15)),
  work(methods, at(20, 15), at(21, 0), 'Due tonight'),
  block('fixed', at(21, 0), at(21, 20), { locked: true, note: 'Daily: Twenty minutes of Spanish' }),
  work(landlord, at(21, 25), at(21, 40), 'Due tomorrow · quick win'),
  // Tomorrow and after, so the day chips have something to show.
  work(loginTest, at(9, 30, 1), at(10, 20, 1), 'High priority · sharp hours'),
  block('break', at(10, 20, 1), at(10, 30, 1)),
  work(stats, at(10, 30, 1), at(11, 45, 1), 'Steady work · mid-morning'),
  work(posters, at(14, 0, 1), at(14, 45, 1), 'Creative · afternoon lift'),
  work(loginTest, at(9, 30, 2), at(10, 10, 2), 'Finish before Monday'),
];

// Energy over the day, a quarter of an hour at a time: high in the morning, a dip after lunch, fading at night.
const trace = [];
for (let q = 0; q <= (23 - 9) * 4; q += 1) {
  const hour = 9 + q / 4;
  const meter = Math.round(Math.max(18, 96 - (hour - 9) * 4.2 - 14 * Math.exp(-((hour - 14) ** 2) / 1.5)));
  trace.push({ time: at(Math.floor(hour), (q % 4) * 15), meter });
}

const responses = {
  'POST /users': ok({
    id: USER, clerkId: 'dev-member-001', level: 7, totalXP: 2310, currentStreak: 12, multiplier: 1.4,
    googleCalendarToken: null, spinCount: 0, schedulerSettings: null, trackerSettings: null,
    trackerCodeHighWater: null, personalTokenHash: null, createdAt: at(9, 0, -90), updatedAt: at(17, 55),
  }, 201),
  'GET /quests': ok(active),
  'GET /quests/rescue': ok(rescue),
  'GET /quests/recurring': ok(recurring),
  'GET /quests/completed': ok(completed),
  'GET /schedule/dev-member-001': ok({ schedule, feasibilityReport: { ok: true, issues: [] }, insights: null, generatedAt: at(14, 50) }),
  'GET /schedule/dev-member-001/energy': ok({ trace }),
  'GET /checkin/today/dev-member-001': ok({ id: 'c1', date: at(9, 5), energyLevel: 4, availableMinutes: 300 }),
  'GET /users/dev-member-001/achievements': ok([
    ['first-blood', 'First Steps', 25, -80],
    ['dedicated', 'Dedicated', 50, -41],
    ['flow-state', 'Flow State', 75, -12],
    ['week-warrior', 'Week Warrior', 100, -5],
  ].map(([slug, title, xpReward, day]) => ({ slug, title, icon: '', description: '', xpReward, unlockedAt: at(18, 0, day) }))),
  'GET /settings': ok({
    defaults: {
      scoreWeights: { energy: 1.5, urgency: 2, batch: 0.5, monotony: 1.5, tedium: 0.8, cooldown: 0.8, session: 0.5, prefHour: 0.6 },
      workingHours: { startHour: 9, endHour: 18 },
      horizonDays: 7,
      softMaxBlockMin: 90,
      chronotype: 'standard',
    },
    overrides: {},
  }),
};

const out = join(dirname(fileURLToPath(import.meta.url)), 'api.json');
writeFileSync(out, `${JSON.stringify({ now: NOW, timezone: TZ, responses }, null, 1)}\n`);
console.log(`wrote ${out}`);
