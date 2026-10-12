// Thin fetch wrapper for the Focus Guild API.
// Server responses use { success, data } or { success: false, error }.
//
// Auth has two modes, picked at runtime by what's injected from the React tree:
//   - Real Clerk: `setAuthTokenGetter()` is called by <AuthBridge> with
//     `useAuth().getToken`; every request sends `Authorization: Bearer <jwt>`.
//   - Dev fallback: no token getter set; requests send `X-Dev-Clerk-Id`
//     header with the current dev/Clerk-user id. The server's auth.ts
//     middleware understands both.

export const DEV_CLERK_ID = 'dev-member-001';

// Live identity for URL-path and body fields like /users/:clerkId, ?clerkId=.
// Defaults to the dev member; replaced by setCurrentClerkId() after sign-in.
let _currentClerkId: string = DEV_CLERK_ID;
let _tokenGetter: (() => Promise<string | null>) | null = null;

/** Set by <AuthBridge> with `useAuth().getToken`. Null in dev mode. */
export function setAuthTokenGetter(fn: (() => Promise<string | null>) | null): void {
  _tokenGetter = fn;
}

/** Set by <AuthBridge> with the signed-in Clerk user id. */
export function setCurrentClerkId(id: string): void {
  _currentClerkId = id;
}

/** Read elsewhere (e.g. default args, useUserStore) so callers stay in sync. */
export function getCurrentClerkId(): string {
  return _currentClerkId;
}

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Minutes to add to the user's local time to reach UTC (PDT → +420, UTC → 0).
 * Sent on every /schedule/* call so the planner computes day boundaries in
 * the user's timezone, not the server's (UTC on Railway).
 */
function tzOffset(): number {
  return new Date().getTimezoneOffset();
}

interface ApiSuccess<T> { success: true; data: T }
interface ApiError    { success: false; error: { code: string; message: string } }
type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Carries the server's error code alongside the message, so callers can
 * branch on it (ACTIVE_CAP_REACHED, NEXT_ACTION_REQUIRED, …) instead of
 * matching on prose. The message keeps the old `CODE: message` shape, so
 * anything already rendering `String(err)` is unaffected.
 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly detail: string;
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'ApiRequestError';
    this.code = code;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers ?? {}) as Record<string, string>),
  };

  if (_tokenGetter) {
    // Real Clerk: send the JWT. The server's auth.ts extracts the clerkId
    // from the verified token, so URL-path ids are advisory only.
    try {
      const token = await _tokenGetter();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // token fetch failed — server will 401
    }
  } else {
    // Dev fallback (no Clerk publishable key configured).
    headers['X-Dev-Clerk-Id'] = _currentClerkId;
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new ApiRequestError(body.error.code, body.error.message);
  }
  return body.data;
}

// ─── Types matching the server schemas ────────────────────────────────────────

export interface User {
  id: string;
  clerkId: string;
  level: number;
  totalXP: number;
  currentStreak: number;
  multiplier: number;
}

export type PriorityTier = 'HIGH' | 'MED' | 'LOW';

export interface Quest {
  id: string;
  userId: string;
  title: string;
  estimatedMinutes: number;
  mentalLoad: number;
  impact: number;
  deadline: string | null;
  status: 'ACTIVE' | 'COMPLETE' | 'NOT_TODAY' | 'RESCUE';
  tags: string[];
  completedAt: string | null;
  createdAt: string;
  priorityScore?: number; // populated by GET /quests

  // Scheduler hints
  tediousness?: number | null;
  category?: string | null;
  preferredHour?: number | null;
  minChunkMin?: number | null;
  maxChunkMin?: number | null;
  setupCost?: number | null;
  urgencyMult?: number | null;
  isRecurring?: boolean;
  priorityTier?: PriorityTier;
  parentQuestId?: string | null;
  doneToday?: boolean; // populated by GET /quests/recurring

  // Sub-quest aggregates populated by GET /quests: the whole subtree, not
  // just the first tier (server/src/lib/questTree.ts).
  subQuestTotal?: number;
  subQuestDone?: number;
  /** Leaf minutes beneath this quest; its own estimate when it has no steps. */
  rolledUpMinutes?: number;

  /** Time written against the quest so far (focus timer and by hand). */
  actualMinutes?: number | null;
}

/** Main quest, step, sub-step. Matches MAX_QUEST_DEPTH on the server. */
export const MAX_QUEST_DEPTH = 3;

/** An hour log: no estimate, time is written down as it is spent. */
export const isHourLog = (q: Pick<Quest, 'estimatedMinutes'>): boolean => q.estimatedMinutes === 0;

export interface QuestRollup {
  /** Sub-quests anywhere beneath this one, and how many are complete. */
  total: number;
  done: number;
  /** Direct children only. */
  childCount: number;
  /** Leaf minutes beneath this quest, or its own estimate when it has none. */
  estimatedMinutes: number;
  doneMinutes: number;
  /** 1 for a main quest, up to MAX_QUEST_DEPTH. */
  depth: number;
  /** False at the deepest tier: no "add a step" there. */
  canNest: boolean;
}

/** One node of the tree returned by GET /quests/:id/subquests. */
export interface QuestNode extends Quest {
  subQuests: QuestNode[];
  rollup: QuestRollup;
}

export interface SubQuestTree {
  subQuests: QuestNode[];
  /** Totals for the quest the tree hangs from. */
  rollup?: QuestRollup;
}

/** A quest another can be filed under, for the "Part of" menu. */
export interface ParentChoice {
  id: string;
  title: string;
  /** 1 for a main quest, 2 for a step. */
  depth: number;
}

/** An hour log with what has been written against it. */
export interface HourLog extends Quest {
  loggedMinutes: number;
  todayMinutes: number;
  /** Since Monday. */
  weekMinutes: number;
  lastLoggedAt: string | null;
}

export interface TimeEntry {
  id: string;
  at: string;
  minutes: number;
  note: string | null;
  /** Written by hand, or left by the focus timer. */
  source: 'hand' | 'timer';
}

export interface LogHoursResult {
  entry: TimeEntry;
  loggedMinutes: number;
  xpAwarded: number;
  totalXP: number;
  newStreak: number;
  newMultiplier: number;
}

/** One thing written by hand, as the Journal shows it. */
export interface JournalItem {
  id: string;
  at: string;
  /** `note`: something written. `hours`: time written against an hour log. */
  kind: 'note' | 'hours';
  text: string;
  rating: number | null;
  minutes: number | null;
  questId: string | null;
  questTitle: string | null;
}

export interface XPEventDTO {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface QuestSchedulerHints {
  tediousness?: number | null;
  category?: string | null;
  preferredHour?: number | null;
  minChunkMin?: number | null;
  maxChunkMin?: number | null;
  setupCost?: number | null;
  urgencyMult?: number | null;
  isRecurring?: boolean;
  priorityTier?: PriorityTier;
}

export interface CheckIn {
  id: string;
  date: string;
  energyLevel: number;
  availableMinutes: number;
}

export interface UnlockedAchievement {
  slug: string;
  title: string;
  icon: string;
  description: string;
  xpReward: number;
}

export interface CompleteQuestResult {
  quest: Quest;
  xpAwarded: number;
  /** Open sub-quests closed out alongside this one. */
  closedSubQuests?: number;
  streakEvent: 'extended' | 'started' | 'paused' | 'unchanged';
  newStreak: number;
  newMultiplier: number;
  totalXP: number;
  newlyUnlocked?: UnlockedAchievement[];
}

export interface AchievementSummary extends UnlockedAchievement {
  unlockedAt: string;
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

export const api = {
  users: {
    upsert: (clerkId = getCurrentClerkId()) =>
      request<User>('/users', { method: 'POST', body: JSON.stringify({ clerkId }) }),
    get: (clerkId = getCurrentClerkId()) =>
      request<User>(`/users/${clerkId}`),
    stats: (clerkId = getCurrentClerkId()) =>
      request<User & { _count: { quests: number } }>(`/users/${clerkId}/stats`),
    achievements: (clerkId = getCurrentClerkId()) =>
      request<AchievementSummary[]>(`/users/${clerkId}/achievements`),
    xpEvents: (clerkId = getCurrentClerkId()) =>
      request<XPEventDTO[]>(`/users/${clerkId}/xp-events`),
  },
  quests: {
    list: (clerkId = getCurrentClerkId()) =>
      // tz lets the server end a "Not Today" at the user's own midnight.
      request<Quest[]>(`/quests?clerkId=${clerkId}&tz=${new Date().getTimezoneOffset()}`),
    completed: (clerkId = getCurrentClerkId()) =>
      request<Quest[]>(`/quests/completed?clerkId=${clerkId}`),
    recurring: (clerkId = getCurrentClerkId()) =>
      request<Quest[]>(`/quests/recurring?clerkId=${clerkId}`),
    rescue: (clerkId = getCurrentClerkId()) =>
      request<Quest[]>(`/quests/rescue?clerkId=${clerkId}`),
    extendDeadline: (id: string, days: number) =>
      request<Quest>(`/quests/${id}/extend-deadline`, {
        method: 'POST',
        body: JSON.stringify({ days }),
      }),
    spinWheel: () =>
      request<{ picked: Quest; newlyUnlocked: UnlockedAchievement[] }>(
        '/quests/spin-wheel',
        { method: 'POST', body: '{}' },
      ),
    /** The nested sub-quest tree beneath a quest, MAX_QUEST_DEPTH tiers in all. */
    subquests: (id: string) =>
      request<SubQuestTree>(`/quests/${id}/subquests`),
    /** Quests a quest can be filed under; pass `forId` when re-filing an existing one. */
    parents: (forId?: string) =>
      request<ParentChoice[]>(`/quests/parents${forId ? `?for=${forId}` : ''}`),
    hourLogs: () =>
      request<HourLog[]>(`/quests/hours?tz=${new Date().getTimezoneOffset()}`),
    hours: (id: string) =>
      request<{ loggedMinutes: number; entries: TimeEntry[] }>(`/quests/${id}/hours`),
    /** Write down time spent. `date` is a local `YYYY-MM-DD`; leave it out for now. */
    logHours: (id: string, input: { minutes: number; note?: string; date?: string }) =>
      request<LogHoursResult>(`/quests/${id}/hours`, {
        method: 'POST',
        body: JSON.stringify({ ...input, tz: new Date().getTimezoneOffset() }),
      }),
    removeHours: (id: string, entryId: string) =>
      request<{ loggedMinutes: number; totalXP: number }>(`/quests/${id}/hours/${entryId}`, { method: 'DELETE' }),
    xpEvents: (id: string) =>
      request<XPEventDTO[]>(`/quests/${id}/xp-events`),
    decompose: (id: string) =>
      request<{ suggestions: Array<{ title: string; estimatedMinutes: number; rationale: string }> }>(
        `/quests/${id}/decompose`,
        { method: 'POST', body: '{}' },
      ),
    /** Bulk import; the server writes them in one transaction. */
    import: (
      quests: Array<{
        title: string;
        estimatedMinutes?: number;
        deadline?: string;
        priorityTier?: PriorityTier;
        tags?: string[];
      }>,
    ) =>
      request<{ created: number; quests: Quest[] }>('/quests/import', {
        method: 'POST',
        body: JSON.stringify({ quests }),
      }),

    create: (
      input: {
        title: string;
        estimatedMinutes?: number;
        mentalLoad?: number;
        impact?: number;
        deadline?: string | null;
        parentQuestId?: string;
        /** An hour log: no estimate. */
        openEnded?: boolean;
        tags?: string[];
      } & QuestSchedulerHints,
      clerkId = getCurrentClerkId(),
    ) =>
      request<Quest>('/quests', { method: 'POST', body: JSON.stringify({ clerkId, ...input }) }),
    update: (
      id: string,
      fields: Partial<Pick<Quest, 'title' | 'estimatedMinutes' | 'mentalLoad' | 'impact' | 'deadline' | 'tags'>> &
        QuestSchedulerHints & { parentQuestId?: string | null; openEnded?: boolean },
    ) => request<Quest>(`/quests/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    complete: (id: string) =>
      request<CompleteQuestResult>(`/quests/${id}/complete`, { method: 'POST' }),
    completeDaily: (id: string) =>
      request<CompleteQuestResult>(`/quests/${id}/complete-daily`, { method: 'POST' }),
    /** Log focused minutes against a quest (feeds progress and estimate calibration). */
    focus: (id: string, minutes: number) =>
      request<Quest>(`/quests/${id}/focus`, { method: 'POST', body: JSON.stringify({ minutes }) }),
    notToday: (id: string) =>
      request<Quest>(`/quests/${id}/not-today`, { method: 'POST' }),
    delete: (id: string) =>
      request<null>(`/quests/${id}`, { method: 'DELETE' }),
  },
  checkin: {
    today: (clerkId = getCurrentClerkId()) =>
      request<CheckIn | null>(`/checkin/today/${clerkId}`),
    submit: (input: { energyLevel: number; availableMinutes: number }, clerkId = getCurrentClerkId()) =>
      request<CheckIn>('/checkin', { method: 'POST', body: JSON.stringify({ clerkId, ...input }) }),
  },
  schedule: {
    generate: (clerkId = getCurrentClerkId()) =>
      request<ScheduleResponse>('/schedule/generate', {
        method: 'POST',
        body: JSON.stringify({ clerkId, tzOffsetMin: tzOffset() }),
      }),
    get: (clerkId = getCurrentClerkId()) =>
      request<ScheduleResponse>(`/schedule/${clerkId}`),
    replan: (clerkId = getCurrentClerkId()) =>
      request<ScheduleResponse>(`/schedule/${clerkId}/replan`, {
        method: 'POST',
        body: JSON.stringify({ tzOffsetMin: tzOffset() }),
      }),
    edit: (edit: ScheduleEdit, clerkId = getCurrentClerkId()) =>
      request<ScheduleResponse>(`/schedule/${clerkId}/edit`, {
        method: 'POST',
        body: JSON.stringify({ edit, tzOffsetMin: tzOffset() }),
      }),
    /** Place one quest into the schedule incrementally. */
    insert: (questId: string, clerkId = getCurrentClerkId()) =>
      request<ScheduleResponse>(`/schedule/${clerkId}/insert/${questId}`, {
        method: 'POST',
        body: JSON.stringify({ tzOffsetMin: tzOffset() }),
      }),
    /** Sampled energy-meter trace across today's working hours. */
    energy: (clerkId = getCurrentClerkId()) =>
      request<{ trace: EnergyTracePoint[] }>(`/schedule/${clerkId}/energy?tzOffsetMin=${tzOffset()}`),
    explain: (blockId: string, clerkId = getCurrentClerkId()) =>
      request<{ explanation: string }>(`/schedule/${clerkId}/explain?blockId=${blockId}`),
    getFillers: (clerkId = getCurrentClerkId()) =>
      request<{ fillers: DailyFiller[] }>(`/schedule/${clerkId}/fillers`),
    setFillers: (fillers: DailyFiller[], clerkId = getCurrentClerkId()) =>
      request<{ fillers: DailyFiller[] }>(`/schedule/${clerkId}/fillers`, {
        method: 'POST',
        body: JSON.stringify({ fillers }),
      }),
  },
  settings: {
    get: () =>
      request<{ defaults: SchedulerConfigShape; overrides: Partial<SchedulerConfigShape> }>(
        '/settings',
      ),
    save: (overrides: Partial<SchedulerConfigShape>) =>
      request<{ overrides: Partial<SchedulerConfigShape> }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(overrides),
      }),
    reset: () =>
      request<{ overrides: Record<string, never> }>('/settings', { method: 'DELETE' }),
  },
  tracker: {
    /** One call for everything the tracker page renders. */
    bootstrap: () => request<TrackerBootstrap>('/tracker'),

    createItem: (input: TrackerItemCreate) =>
      request<TrackerItem>('/tracker/items', { method: 'POST', body: JSON.stringify(input) }),
    updateItem: (id: string, fields: TrackerItemUpdate) =>
      request<TrackerItem>(`/tracker/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      }),
    /** One tap, no confirmation — dropping is meant to be cheap. */
    dropItem: (id: string) =>
      request<TrackerItem>(`/tracker/items/${id}/drop`, { method: 'POST', body: '{}' }),
    deleteItem: (id: string) =>
      request<{ id: string }>(`/tracker/items/${id}`, { method: 'DELETE' }),

    /** Materialise the item's next action as a Quest the scheduler plans. */
    schedule: (id: string, estimatedMinutes?: number) =>
      request<{ item: TrackerItem; quest: Quest }>(`/tracker/items/${id}/schedule`, {
        method: 'POST',
        body: JSON.stringify(estimatedMinutes ? { estimatedMinutes } : {}),
      }),
    unschedule: (id: string) =>
      request<TrackerItem>(`/tracker/items/${id}/schedule`, { method: 'DELETE' }),

    addReflection: (itemId: string, input: ReflectionCreate) =>
      request<TrackerReflection>(`/tracker/items/${itemId}/reflections`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    deleteReflection: (id: string) =>
      request<{ id: string }>(`/tracker/reflections/${id}`, { method: 'DELETE' }),

    createDomain: (input: { name: string; color?: string }) =>
      request<TrackerDomain>('/tracker/domains', { method: 'POST', body: JSON.stringify(input) }),
    updateDomain: (id: string, fields: { name?: string; color?: string }) =>
      request<TrackerDomain>(`/tracker/domains/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      }),
    /** Whole new order in one call, so a reorder isn't N requests. */
    reorderDomains: (ids: string[]) =>
      request<TrackerDomain[]>('/tracker/domains/order', {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      }),
    /** Items survive — their domain is nulled and they land in Unsorted. */
    deleteDomain: (id: string) =>
      request<{ id: string }>(`/tracker/domains/${id}`, { method: 'DELETE' }),

    addParkingLot: (text: string) =>
      request<ParkingLotEntry>('/tracker/parking-lot', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    deleteParkingLot: (id: string) =>
      request<{ id: string }>(`/tracker/parking-lot/${id}`, { method: 'DELETE' }),
    promoteParkingLot: (id: string, input: { domainId?: string | null } = {}) =>
      request<TrackerItem>(`/tracker/parking-lot/${id}/promote`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /** Append-only by design: there is no update or delete. */
    addDecision: (text: string) =>
      request<DecisionLogEntry>('/tracker/decisions', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),

    updateInterview: (ordinal: 1 | 2 | 3, fields: { date?: string | null; notes?: string | null }) =>
      request<CasInterview>(`/tracker/interviews/${ordinal}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      }),

    cas: () => request<CasProjection>('/tracker/cas'),

    getConfig: () =>
      request<{ config: TrackerConfigShape; overrides: TrackerOverrides }>('/tracker/config'),
    /** Takes a whole preset set — which is also what preset import posts. */
    saveConfig: (overrides: TrackerOverrides) =>
      request<{ config: TrackerConfigShape; overrides: TrackerOverrides }>('/tracker/config', {
        method: 'PUT',
        body: JSON.stringify(overrides),
      }),
    resetConfig: () =>
      request<{ config: TrackerConfigShape; overrides: TrackerOverrides }>('/tracker/config', {
        method: 'DELETE',
      }),

    export: (tier: ExportTier, since?: string | null) =>
      request<{ tier: ExportTier; markdown: string; chars: number }>(
        `/tracker/export?tier=${tier}${since ? `&since=${encodeURIComponent(since)}` : ''}`,
      ),
    /** All four tier sizes in one call, so the buttons can show them upfront. */
    exportSizes: () =>
      request<{ sizes: Record<ExportTier, number> }>('/tracker/export/sizes'),
    importPreview: (markdown: string) =>
      request<{ diff: ImportDiff; schema: number | null; tier: ExportTier | null }>(
        '/tracker/import/preview',
        { method: 'POST', body: JSON.stringify({ markdown }) },
      ),
    importApply: (markdown: string) =>
      request<ImportApplyResult>('/tracker/import/apply', {
        method: 'POST',
        body: JSON.stringify({ markdown }),
      }),
  },

  /** Calendar feeds and the personal inbox token. */
  integrations: {
    get: () => request<IntegrationsState>('/integrations'),
    addCalendar: (name: string, url: string) =>
      request<CalendarSyncResult>('/integrations/calendars', { method: 'POST', body: JSON.stringify({ name, url }) }),
    syncCalendar: (id: string) =>
      request<CalendarSyncResult>(`/integrations/calendars/${id}/sync`, { method: 'POST', body: '{}' }),
    removeCalendar: (id: string) => request<{ id: string }>(`/integrations/calendars/${id}`, { method: 'DELETE' }),
    createToken: () => request<{ token: string }>('/integrations/token', { method: 'POST', body: '{}' }),
    revokeToken: () => request<{ revoked: boolean }>('/integrations/token', { method: 'DELETE' }),
  },

  /** Activity log, permafile and AI bundle. `tz` is getTimezoneOffset(). */
  chronicle: {
    log: (days = 7) => request<ActivityEntry[]>(`/chronicle/log?days=${days}`),
    journal: (text: string, rating?: number) =>
      request<ActivityEntry>('/chronicle/journal', { method: 'POST', body: JSON.stringify({ text, rating }) }),
    /** What was written by hand, newest first. `before` pages back from the oldest entry shown. */
    journalPage: (before?: string) =>
      request<{ entries: JournalItem[]; hasMore: boolean }>(
        `/chronicle/journal${before ? `?before=${encodeURIComponent(before)}` : ''}`,
      ),
    editJournal: (id: string, text: string) =>
      request<JournalItem>(`/chronicle/journal/${id}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
    deleteJournal: (id: string) => request<null>(`/chronicle/journal/${id}`, { method: 'DELETE' }),
    permafile: () => request<PermafileState>('/chronicle/permafile'),
    savePermafile: (body: string) =>
      request<{ changed: boolean; id?: string }>('/chronicle/permafile', { method: 'PUT', body: JSON.stringify({ body }) }),
    restorePermafile: (id: string) =>
      request<{ id: string }>(`/chronicle/permafile/restore/${id}`, { method: 'POST', body: '{}' }),
    ask: (question: string, days = 14) =>
      request<GuildReply>('/chronicle/ask', {
        method: 'POST',
        body: JSON.stringify({ question, days, tz: new Date().getTimezoneOffset() }),
      }),
    bundle: (days = 7) =>
      request<{ markdown: string; chars: number; entries: number }>(
        `/chronicle/bundle?days=${days}&tz=${new Date().getTimezoneOffset()}`,
      ),
  },
};

// ─── Ask the Guild types ──────────────────────────────────────────────────────

/** Mirrors server lib/chronicle.ts. Actions are suggestions, never applied for you. */
export type GuildActionKind = 'park' | 'journal' | 'decision' | 'drop' | 'schedule';

export interface GuildAction {
  kind: GuildActionKind;
  label: string;
  text?: string;
  code?: string;
}

export interface GuildReply {
  answer: string;
  actions: GuildAction[];
  contextChars: number;
  days: number;
}

export const WEEKLY_REVIEW_QUESTION =
  'Write my weekly review. What actually moved, what stalled and why, what I should let go of, ' +
  'and the three things that matter most next week. Be concrete and use my item codes.';

// ─── Integration types ────────────────────────────────────────────────────────

export interface CalendarSourceInfo {
  id: string;
  name: string;
  /** Masked: host plus the tail of the path, never the secret URL. */
  host: string;
  lastSyncAt: string | null;
  lastError: string | null;
  eventCount: number;
}

export interface IntegrationsState {
  calendars: CalendarSourceInfo[];
  /** One personal access token powers the inbox, the API and the connector. */
  tokenEnabled: boolean;
}

export type CalendarSyncResult = { calendar: CalendarSourceInfo; count?: number; error?: string };

// ─── Chronicle types ──────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  at: string;
  kind: string;
  line: string;
  subjectId: string | null;
}

export interface PermafileState {
  body: string;
  /** True when nothing has been saved yet and `body` is the starter template. */
  isTemplate: boolean;
  versions: Array<{ id: string; source: string; createdAt: string; chars: number }>;
}

// ─── Settings types ───────────────────────────────────────────────────────────

/**
 * Per-decision scoring weights for the timeline constructor. Each term is
 * normalized to [0,1] before weighting, so these are importance ratios.
 * Mirrors server scheduler/types.ts ScoreWeights.
 */
export interface ScoreWeights {
  energy: number;
  urgency: number;
  batch: number;
  prefHour: number;
  monotony: number;
  tedium: number;
  cooldown: number;
  session: number;
}

export interface WorkingHours {
  startHour: number;
  endHour: number;
}

/** When in the day the user is sharpest; picks the planner's energy curve. */
export type Chronotype = 'standard' | 'lark' | 'afternoon' | 'owl';

export interface SchedulerConfigShape {
  scoreWeights: ScoreWeights;
  workingHours: WorkingHours;
  horizonDays: number;
  softMaxBlockMin: number;
  chronotype: Chronotype;
}

// ─── Schedule types ───────────────────────────────────────────────────────────

export interface ScheduleBlock {
  id: string;
  start: string;
  end: string;
  durationMin: number;
  type: 'work' | 'break' | 'fixed' | 'buffer';
  taskId: string | null;
  locked: boolean;
  note: string | null;
  /** Plain-language "why now" for work blocks, e.g. "Due tomorrow · this finishes it" (48 characters at most). */
  reason?: string | null;
}

export interface FeasibilityIssue {
  taskId: string;
  shortfallMin: number;
  suggestions: string[];
}

export interface ScheduleResponse {
  schedule: ScheduleBlock[];
  feasibilityReport: { ok: boolean; issues: FeasibilityIssue[] };
  generatedAt: string | null;
  insights?: PlanInsights | null;
}

/** Mirrors server lib/scheduler/insights.ts: what the plan can't say by itself. */
export interface PlanInsights {
  overdue: Array<{ id: string; title: string; daysOverdue: number }>;
  capacity: { working: number; routines: number; calendar: number; quests: number };
  backlog: { undatedMin: number; plannedThisWeekMin: number; weeksToClear: number | null } | null;
  hoursSuggestion: { startHour: number; endHour: number; reason: string } | null;
  calibration: { global: number; byCategory: Record<string, number>; sample: number } | null;
  notes: string[];
}

export interface EnergyTracePoint {
  time: string;
  meter: number;
}

export type ScheduleEdit =
  | { kind: 'move_block'; blockId: string; newStart: string }
  | { kind: 'swap_blocks'; aId: string; bId: string }
  | { kind: 'delete_block'; blockId: string }
  | { kind: 'pin_block'; blockId: string }
  | { kind: 'unpin_block'; blockId: string };

export interface DailyFiller {
  id: string;
  name: string;
  durationMin: number;
  preferredHour: number | null;
  enabled?: boolean;
}

// ─── Tracker types ────────────────────────────────────────────────────────────
//
// Mirrors server/src/lib/tracker/*. The five statuses are a fixed DB enum
// because behaviour depends on them (active cap, export exclusions); only
// their labels are user-editable, which is what `statusLabels` carries.

export const TRACKER_STATUSES = ['TODO', 'ACTIVE', 'BLOCKED', 'DONE', 'DROPPED'] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export const CAS_STRANDS = ['creativity', 'activity', 'service'] as const;
export type CasStrand = (typeof CAS_STRANDS)[number];

/** IB learning outcomes are numbered 1..7. */
export const LEARNING_OUTCOMES = [1, 2, 3, 4, 5, 6, 7] as const;

export type ExportTier = 'compact' | 'working' | 'full' | 'archive';

export interface TrackerReflection {
  id: string;
  itemId: string;
  text: string;
  date: string;
  loTags: number[];
  mediaUrl: string | null;
  createdAt: string;
}

export interface TrackerDomain {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface TrackerItem {
  id: string;
  code: string;
  domainId: string | null;
  title: string;
  status: TrackerStatus;
  /** Physical first step, not a topic. Shown more prominently than the title. */
  nextAction: string | null;
  notes: string | null;
  dueDate: string | null;
  /** Set once the next action has been materialised as a Quest. */
  questId: string | null;
  /** Non-empty ⇒ CAS-tagged, which is also what exempts it from the cap. */
  casStrands: CasStrand[];
  learningOutcomes: number[];
  isCourseworkLinked: boolean;
  casStartDate: string | null;
  casEndDate: string | null;
  isCasProject: boolean;
  hours: number | null;
  completedAt: string | null;
  droppedAt: string | null;
  createdAt: string;
  updatedAt: string;
  domain: { name: string } | null;
  reflections: TrackerReflection[];
}

export interface ParkingLotEntry {
  id: string;
  text: string;
  promotedToCode: string | null;
  createdAt: string;
}

export interface DecisionLogEntry {
  id: string;
  text: string;
  decidedAt: string;
  createdAt: string;
}

export interface CasInterview {
  id: string;
  ordinal: number;
  date: string | null;
  notes: string | null;
}

export interface TrackerRequiredFields {
  nextActionForActive: boolean;
  domain: boolean;
  dueDate: boolean;
}

export interface TrackerConfigShape {
  activeCap: number;
  statusLabels: Record<TrackerStatus, string>;
  codePrefixes: string[];
  requiredFields: TrackerRequiredFields;
  reviewCadenceDays: number;
  reviewPrompts: string[];
  showHours: boolean;
}

/** Only the fields the user actually changed; everything else falls back. */
export type TrackerOverrides = Partial<{
  activeCap: number;
  statusLabels: Partial<Record<TrackerStatus, string>>;
  codePrefixes: string[];
  requiredFields: Partial<TrackerRequiredFields>;
  reviewCadenceDays: number;
  reviewPrompts: string[];
  showHours: boolean;
}>;

export interface TrackerBootstrap {
  config: TrackerConfigShape;
  domains: TrackerDomain[];
  items: TrackerItem[];
  parkingLot: ParkingLotEntry[];
  decisions: DecisionLogEntry[];
  interviews: CasInterview[];
  /** Resolved quests for items that have been scheduled; may be shorter
   *  than the set of linked ids if a quest was deleted from the feed. */
  linkedQuests: Array<{ id: string; title: string; status: string }>;
  /** ACTIVE items counting against the cap — CAS-tagged ones are exempt. */
  activeUsed: number;
}

export interface TrackerItemCreate {
  title: string;
  domainId?: string | null;
  status?: TrackerStatus;
  nextAction?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  codePrefix?: string;
  casStrands?: CasStrand[];
  learningOutcomes?: number[];
  isCourseworkLinked?: boolean;
  casStartDate?: string | null;
  casEndDate?: string | null;
  isCasProject?: boolean;
  hours?: number | null;
}

/** Every field optional: PATCH asserts only what it sends. */
export type TrackerItemUpdate = Partial<Omit<TrackerItemCreate, 'codePrefix'>>;

export interface ReflectionCreate {
  text: string;
  date?: string;
  loTags?: number[];
  mediaUrl?: string | null;
}

// ─── CAS projections ──────────────────────────────────────────────────────────

export interface MatrixCell {
  outcome: number;
  strand: CasStrand;
  /** Item codes supplying evidence for this pairing. */
  codes: string[];
}

export interface CoverageMatrix {
  outcomes: number[];
  strands: CasStrand[];
  cells: MatrixCell[];
  /** Outcomes with no evidence in any strand — the gaps worth acting on. */
  uncoveredOutcomes: number[];
  coveredCount: number;
  totalCells: number;
}

export interface StrandBalance {
  strand: CasStrand;
  itemCount: number;
  daysSinceLastActivity: number | null;
  totalDurationDays: number;
  /** Only present when the optional hours field is switched on. */
  totalHours?: number;
}

export interface CasProjection {
  matrix: CoverageMatrix;
  balance: StrandBalance[];
  conflicts: Array<{ code: string; title: string }>;
  interviews: CasInterview[];
}

// ─── Markdown import ──────────────────────────────────────────────────────────

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** Incoming item as parsed from markdown — every field may be unasserted. */
export interface MdItem {
  code: string;
  title: string;
  status: TrackerStatus;
  domain?: string | null;
  nextAction?: string | null;
  dueDate?: string | null;
  casStrands?: CasStrand[];
}

export interface ImportDiff {
  creates: MdItem[];
  updates: Array<{ code: string; changes: FieldChange[]; incoming: MdItem }>;
  /** In the import and identical — nothing to do. */
  unchanged: string[];
  /** In the app but absent from the import. Reported, never deleted. */
  untouched: string[];
  warnings: string[];
}

export interface ImportApplyResult {
  created: number;
  updated: number;
  unchanged: number;
  untouched: number;
  warnings: string[];
}

// ─── Quest manifest (bulk import and export) ──────────────────────────────────
// The tree is `ManifestQuest` in lib/manifest.ts; the server's copy of the
// shape is server/src/lib/questImport.ts.

import type { ManifestQuest } from './manifest';

export interface ManifestCounts {
  quests: number;
  steps: number;
  hourLogs: number;
  routines: number;
}

export const manifestApi = {
  /** All of it or none of it: one transaction on the server. */
  import: (quests: ManifestQuest[]) =>
    request<ManifestCounts & { created: number }>('/manifest/import', { method: 'POST', body: JSON.stringify({ quests }) }),
  /** Every unfinished quest, with its steps. */
  export: () => request<{ quests: ManifestQuest[]; count: number }>('/manifest/export'),
};

// ─── Your AI (providers connected with the person's own API key) ──────────────
// Server: routes/ai.ts. A key goes up once and never comes back: a connection
// is known by its provider, its model and the last four characters of the key.

export interface AiProvider {
  id: string;
  /** What people call it: Claude, ChatGPT, Gemini. */
  name: string;
  /** Who bills for it. */
  company: string;
  /** The line under the name in the list. */
  tagline: string;
  /** Where a key is made; empty for "Another provider". */
  keyUrl: string;
  note: string;
  needsBaseUrl: boolean;
}

export interface AiConnection {
  provider: string;
  model: string;
  keyHint: string;
  baseUrl: string | null;
  /** The one the Guild's AI features run on. */
  inUse: boolean;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface AiState {
  providers: AiProvider[];
  connections: AiConnection[];
  /** Set when the server has a Claude key of its own. */
  builtIn: string | null;
  /** Who answers right now, in words; null when no AI feature can run. */
  inUse: string | null;
}

export type AiTestResult = { ok: true; reply: string; ms: number; via: string } | { ok: false; error: string; code: string; ms: number };

export const aiApi = {
  get: () => request<AiState>('/ai'),
  connect: (provider: string, apiKey: string, baseUrl?: string) =>
    request<AiState & { models: string[]; provider: string }>('/ai/connections', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, ...(baseUrl ? { baseUrl } : {}) }),
    }),
  models: (provider: string) => request<{ models: string[] }>(`/ai/connections/${provider}/models`),
  update: (provider: string, change: { model?: string; isDefault?: true }) =>
    request<AiState>(`/ai/connections/${provider}`, { method: 'PATCH', body: JSON.stringify(change) }),
  remove: (provider: string) => request<AiState>(`/ai/connections/${provider}`, { method: 'DELETE' }),
  test: (provider: string) => request<AiTestResult>(`/ai/connections/${provider}/test`, { method: 'POST', body: '{}' }),
  /** Notes in, a quest manifest out, written by the AI in use. */
  writeManifest: (notes: string, guide: string) =>
    request<{ text: string; via: string }>('/ai/manifest', { method: 'POST', body: JSON.stringify({ notes, guide }) }),
};
