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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
    throw new Error(`${body.error.code}: ${body.error.message}`);
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

  // Sub-quest aggregates populated by GET /quests
  subQuestTotal?: number;
  subQuestDone?: number;
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
      request<Quest[]>(`/quests?clerkId=${clerkId}`),
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
    subquests: (id: string) =>
      request<Quest[]>(`/quests/${id}/subquests`),
    xpEvents: (id: string) =>
      request<XPEventDTO[]>(`/quests/${id}/xp-events`),
    decompose: (id: string) =>
      request<{ suggestions: Array<{ title: string; estimatedMinutes: number; rationale: string }> }>(
        `/quests/${id}/decompose`,
        { method: 'POST', body: '{}' },
      ),
    create: (
      input: {
        title: string;
        estimatedMinutes?: number;
        mentalLoad?: number;
        impact?: number;
        deadline?: string | null;
        parentQuestId?: string;
        tags?: string[];
      } & QuestSchedulerHints,
      clerkId = getCurrentClerkId(),
    ) =>
      request<Quest>('/quests', { method: 'POST', body: JSON.stringify({ clerkId, ...input }) }),
    update: (
      id: string,
      fields: Partial<Pick<Quest, 'title' | 'estimatedMinutes' | 'mentalLoad' | 'impact' | 'deadline'>> &
        QuestSchedulerHints,
    ) => request<Quest>(`/quests/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    complete: (id: string) =>
      request<CompleteQuestResult>(`/quests/${id}/complete`, { method: 'POST' }),
    completeDaily: (id: string) =>
      request<CompleteQuestResult>(`/quests/${id}/complete-daily`, { method: 'POST' }),
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
};

// ─── Settings types ───────────────────────────────────────────────────────────

export interface SchedulerWeights {
  urgency: number;
  staleness: number;
  timeFit: number;
  energyFit: number;
  chunkFit: number;
  adjacency: number;
  switch: number;
  fragmentation: number;
  oversize: number;
}

export interface BreakPolicy {
  shortBreakAfterMin: number;
  shortBreakDurationMin: number;
  longBreakAfterMin: number;
  longBreakDurationMin: number;
}

export interface WorkingHours {
  startHour: number;
  endHour: number;
}

export interface SchedulerConfigShape {
  weights: SchedulerWeights;
  breakPolicy: BreakPolicy;
  workingHours: WorkingHours;
  horizonDays: number;
  softMaxBlockMin: number;
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
