/**
 * Per-user tracker presets.
 *
 * Mirrors `userConfig.ts`: overrides live in `User.trackerSettings` (JSON),
 * only changed fields are stored, everything else falls back to defaults.
 * This module is the ONLY place presets turn into a usable `TrackerConfig`.
 *
 * Domains are NOT config — they're `tracker_domains` rows, because items
 * hold a foreign key to them and they need stable ids for reordering.
 *
 * Note on status: the five states are fixed in the DB enum because logic
 * depends on them (active cap, export exclusions). What's user-editable is
 * their *labels* — so a user can call BLOCKED "waiting" without changing
 * any behaviour.
 */

export const TRACKER_STATUSES = ['TODO', 'ACTIVE', 'BLOCKED', 'DONE', 'DROPPED'] as const;
export type TrackerStatusName = (typeof TRACKER_STATUSES)[number];

export const CAS_STRANDS = ['creativity', 'activity', 'service'] as const;
export type CasStrand = (typeof CAS_STRANDS)[number];

/** IB learning outcomes are numbered 1..7. */
export const LEARNING_OUTCOMES = [1, 2, 3, 4, 5, 6, 7] as const;

/** Which optional fields the user wants enforced on save. */
export interface RequiredFields {
  /** A physical first step is required to move an item to ACTIVE. */
  nextActionForActive: boolean;
  domain: boolean;
  dueDate: boolean;
}

export interface TrackerConfig {
  /** Max simultaneously ACTIVE items. CAS-tagged items are exempt. */
  activeCap: number;
  statusLabels: Record<TrackerStatusName, string>;
  /** Allowed code prefixes; the first is used when auto-assigning. */
  codePrefixes: string[];
  requiredFields: RequiredFields;
  reviewCadenceDays: number;
  reviewPrompts: string[];
  /**
   * IB requires no hour tracking, so the hours field is hidden by default.
   * Schools that impose their own quota can switch it on.
   */
  showHours: boolean;
}

export function defaultTrackerConfig(): TrackerConfig {
  return {
    activeCap: 5,
    statusLabels: {
      TODO: 'Todo',
      ACTIVE: 'Active',
      BLOCKED: 'Blocked',
      DONE: 'Done',
      DROPPED: 'Dropped',
    },
    codePrefixes: ['A'],
    requiredFields: {
      nextActionForActive: true,
      domain: false,
      dueDate: false,
    },
    reviewCadenceDays: 7,
    reviewPrompts: [
      'Which active items moved this week?',
      'Is anything active without a real next step?',
      'What should be dropped rather than carried?',
    ],
    showHours: false,
  };
}

/** Suggested starting domains, created on first tracker load. */
export const STARTER_DOMAINS: Array<{ name: string; color: string }> = [
  { name: 'Academics', color: '#8b5cf6' },
  { name: 'CAS', color: '#22c55e' },
  { name: 'Personal', color: '#f59e0b' },
];

export type TrackerOverrides = Partial<{
  activeCap: number;
  statusLabels: Partial<Record<TrackerStatusName, string>>;
  codePrefixes: string[];
  requiredFields: Partial<RequiredFields>;
  reviewCadenceDays: number;
  reviewPrompts: string[];
  showHours: boolean;
}>;

/** Type-narrow helper for JSON-from-DB. */
function isOverrides(v: unknown): v is TrackerOverrides {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Merge user overrides on top of `defaultTrackerConfig()`. */
export function getTrackerConfig(user: { trackerSettings?: unknown }): TrackerConfig {
  const base = defaultTrackerConfig();
  const o = isOverrides(user.trackerSettings) ? user.trackerSettings : {};

  return {
    activeCap: o.activeCap ?? base.activeCap,
    statusLabels: { ...base.statusLabels, ...(o.statusLabels ?? {}) },
    codePrefixes:
      Array.isArray(o.codePrefixes) && o.codePrefixes.length > 0
        ? o.codePrefixes
        : base.codePrefixes,
    requiredFields: { ...base.requiredFields, ...(o.requiredFields ?? {}) },
    reviewCadenceDays: o.reviewCadenceDays ?? base.reviewCadenceDays,
    reviewPrompts: o.reviewPrompts ?? base.reviewPrompts,
    showHours: o.showHours ?? base.showHours,
  };
}

/** Return just the overrides part (what the presets UI binds to). */
export function getTrackerOverrides(user: { trackerSettings?: unknown }): TrackerOverrides {
  return isOverrides(user.trackerSettings) ? user.trackerSettings : {};
}

/** True when an item participates in CAS (and is therefore cap-exempt). */
export function isCasTagged(item: { casStrands: string[] }): boolean {
  return item.casStrands.length > 0;
}

/**
 * CAS may not double-count with DP coursework. An item that is both
 * coursework-linked and CAS-tagged needs the user to resolve one or the other.
 */
export function hasCourseworkConflict(item: {
  casStrands: string[];
  isCourseworkLinked: boolean;
}): boolean {
  return item.isCourseworkLinked && isCasTagged(item);
}

/**
 * Highest number ever issued per prefix, e.g. `{ A: 29 }`. Kept on the user
 * (not in presets, which a save or reset replaces wholesale) and bumped when
 * an item is deleted — the only moment a code leaves `existingCodes`.
 */
export type CodeHighWater = Record<string, number>;

/** Type-narrow helper for JSON-from-DB. */
export function readHighWater(v: unknown): CodeHighWater {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const out: CodeHighWater = {};
  for (const [k, n] of Object.entries(v)) {
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Record a deleted code so its number is never handed out again. */
export function bumpHighWater(highWater: CodeHighWater, code: string): CodeHighWater {
  const m = /^(\D+)(\d+)$/.exec(code);
  if (!m) return highWater;
  const [, prefix, num] = m as unknown as [string, string, string];
  const n = Number(num);
  return n > (highWater[prefix] ?? 0) ? { ...highWater, [prefix]: n } : highWater;
}

/**
 * Next free code for a prefix, given codes in use and the high-water mark.
 * Codes are never reused: deleting the highest item must not free its number,
 * because markdown import matches on code and an old export would otherwise
 * update whichever new item inherited it.
 */
export function nextItemCode(
  existingCodes: string[],
  prefix: string,
  highWater: CodeHighWater = {},
): string {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  let max = highWater[prefix] ?? 0;
  for (const code of existingCodes) {
    const m = re.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}
