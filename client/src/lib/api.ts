// Thin fetch wrapper for the Focus Guild API.
// Server responses use { success, data } or { success: false, error }.
//
// DEV MODE: until Clerk auth is wired, we use a fixed clerkId so the full
// stack can be exercised end-to-end. Replace with Clerk's useAuth() later.

export const DEV_CLERK_ID = 'dev-member-001';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface ApiSuccess<T> { success: true; data: T }
interface ApiError    { success: false; error: { code: string; message: string } }
type ApiResponse<T> = ApiSuccess<T> | ApiError;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      // Dev auth identifier. When real Clerk is wired, swap this for
      // `Authorization: Bearer <Clerk session token>` from useAuth().getToken().
      'X-Dev-Clerk-Id': DEV_CLERK_ID,
      ...(init?.headers ?? {}),
    },
  });
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
  doneToday?: boolean; // populated by GET /quests/recurring
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
    upsert: (clerkId = DEV_CLERK_ID) =>
      request<User>('/users', { method: 'POST', body: JSON.stringify({ clerkId }) }),
    get: (clerkId = DEV_CLERK_ID) =>
      request<User>(`/users/${clerkId}`),
    stats: (clerkId = DEV_CLERK_ID) =>
      request<User & { _count: { quests: number } }>(`/users/${clerkId}/stats`),
    achievements: (clerkId = DEV_CLERK_ID) =>
      request<AchievementSummary[]>(`/users/${clerkId}/achievements`),
  },
  quests: {
    list: (clerkId = DEV_CLERK_ID) =>
      request<Quest[]>(`/quests?clerkId=${clerkId}`),
    completed: (clerkId = DEV_CLERK_ID) =>
      request<Quest[]>(`/quests/completed?clerkId=${clerkId}`),
    recurring: (clerkId = DEV_CLERK_ID) =>
      request<Quest[]>(`/quests/recurring?clerkId=${clerkId}`),
    rescue: (clerkId = DEV_CLERK_ID) =>
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
    create: (
      input: {
        title: string;
        estimatedMinutes?: number;
        mentalLoad?: number;
        impact?: number;
        deadline?: string | null;
      } & QuestSchedulerHints,
      clerkId = DEV_CLERK_ID,
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
    today: (clerkId = DEV_CLERK_ID) =>
      request<CheckIn | null>(`/checkin/today/${clerkId}`),
    submit: (input: { energyLevel: number; availableMinutes: number }, clerkId = DEV_CLERK_ID) =>
      request<CheckIn>('/checkin', { method: 'POST', body: JSON.stringify({ clerkId, ...input }) }),
  },
  schedule: {
    generate: (clerkId = DEV_CLERK_ID) =>
      request<ScheduleResponse>('/schedule/generate', {
        method: 'POST',
        body: JSON.stringify({ clerkId }),
      }),
    get: (clerkId = DEV_CLERK_ID) =>
      request<ScheduleResponse>(`/schedule/${clerkId}`),
    replan: (clerkId = DEV_CLERK_ID) =>
      request<ScheduleResponse>(`/schedule/${clerkId}/replan`, { method: 'POST', body: '{}' }),
    edit: (edit: ScheduleEdit, clerkId = DEV_CLERK_ID) =>
      request<ScheduleResponse>(`/schedule/${clerkId}/edit`, {
        method: 'POST',
        body: JSON.stringify({ edit }),
      }),
    explain: (blockId: string, clerkId = DEV_CLERK_ID) =>
      request<{ explanation: string }>(`/schedule/${clerkId}/explain?blockId=${blockId}`),
    getFillers: (clerkId = DEV_CLERK_ID) =>
      request<{ fillers: DailyFiller[] }>(`/schedule/${clerkId}/fillers`),
    setFillers: (fillers: DailyFiller[], clerkId = DEV_CLERK_ID) =>
      request<{ fillers: DailyFiller[] }>(`/schedule/${clerkId}/fillers`, {
        method: 'POST',
        body: JSON.stringify({ fillers }),
      }),
  },
};

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
