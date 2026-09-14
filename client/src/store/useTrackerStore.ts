/**
 * Tracker store — long-horizon items, presets, parking lot, decisions and CAS.
 *
 * One bootstrap call fills everything the tracker page renders; individual
 * mutations patch the local arrays rather than refetching, so a one-tap drop
 * feels instant.
 *
 * CAS mode is a *lens*, not a mode of operation: it lives here (persisted in
 * localStorage so it survives a reload) and changes what is rendered, never
 * what is written. Cap exemption in particular is a property of the data —
 * an item is exempt because it has CAS strands, not because the lens is on —
 * so `cappedActive()` applies the same rule the server does regardless.
 */

import { create } from 'zustand';
import {
  api,
  type CasInterview,
  type CasProjection,
  type DecisionLogEntry,
  type ParkingLotEntry,
  type ReflectionCreate,
  type TrackerBootstrap,
  type TrackerConfigShape,
  type TrackerDomain,
  type TrackerItem,
  type TrackerItemCreate,
  type TrackerItemUpdate,
  type TrackerOverrides,
} from '../lib/api';
import { duckReact } from './useMascotStore';

const CAS_MODE_KEY = 'fg.tracker.casMode';
const LAST_REVIEW_KEY = 'fg.tracker.lastReviewedAt';

/** localStorage is per-device and may be unavailable (private mode, SSR). */
function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-fatal — the lens just won't persist across reloads.
  }
}

/**
 * Items occupying capped active slots. CAS-tagged items are exempt, mirroring
 * `countCappedActive()` on the server so the indicator never disagrees with
 * the error the server would return.
 */
export function cappedActive(items: TrackerItem[]): number {
  return items.filter((i) => i.status === 'ACTIVE' && i.casStrands.length === 0).length;
}

/** True when an item is both coursework-linked and CAS-tagged. */
export function hasCourseworkConflict(item: TrackerItem): boolean {
  return item.isCourseworkLinked && item.casStrands.length > 0;
}

interface TrackerState {
  config: TrackerConfigShape | null;
  overrides: TrackerOverrides;
  domains: TrackerDomain[];
  items: TrackerItem[];
  parkingLot: ParkingLotEntry[];
  decisions: DecisionLogEntry[];
  interviews: CasInterview[];
  linkedQuests: TrackerBootstrap['linkedQuests'];
  cas: CasProjection | null;

  loading: boolean;
  loaded: boolean;
  error: string | null;

  /** Lens only. Never gates a write. */
  casMode: boolean;
  lastReviewedAt: string | null;

  load: () => Promise<void>;
  loadCas: () => Promise<void>;
  setCasMode: (on: boolean) => void;
  markReviewed: () => void;

  createItem: (input: TrackerItemCreate) => Promise<TrackerItem>;
  updateItem: (id: string, fields: TrackerItemUpdate) => Promise<TrackerItem>;
  dropItem: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  scheduleItem: (id: string) => Promise<void>;
  unscheduleItem: (id: string) => Promise<void>;

  addReflection: (itemId: string, input: ReflectionCreate) => Promise<void>;
  deleteReflection: (itemId: string, reflectionId: string) => Promise<void>;

  createDomain: (input: { name: string; color?: string }) => Promise<void>;
  updateDomain: (id: string, fields: { name?: string; color?: string }) => Promise<void>;
  reorderDomains: (ids: string[]) => Promise<void>;
  deleteDomain: (id: string) => Promise<void>;

  addParkingLot: (text: string) => Promise<void>;
  deleteParkingLot: (id: string) => Promise<void>;
  promoteParkingLot: (id: string, domainId?: string | null) => Promise<TrackerItem>;

  addDecision: (text: string) => Promise<void>;
  updateInterview: (
    ordinal: 1 | 2 | 3,
    fields: { date?: string | null; notes?: string | null },
  ) => Promise<void>;

  saveConfig: (overrides: TrackerOverrides) => Promise<void>;
  resetConfig: () => Promise<void>;
}

export const useTrackerStore = create<TrackerState>((set, get) => ({
  config: null,
  overrides: {},
  domains: [],
  items: [],
  parkingLot: [],
  decisions: [],
  interviews: [],
  linkedQuests: [],
  cas: null,

  loading: false,
  loaded: false,
  error: null,

  casMode: readLocal(CAS_MODE_KEY) === '1',
  lastReviewedAt: readLocal(LAST_REVIEW_KEY),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.tracker.bootstrap();
      set({
        config: data.config,
        domains: data.domains,
        items: data.items,
        parkingLot: data.parkingLot,
        decisions: data.decisions,
        interviews: data.interviews,
        linkedQuests: data.linkedQuests ?? [],
        loading: false,
        loaded: true,
      });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  loadCas: async () => {
    try {
      const cas = await api.tracker.cas();
      set({ cas, interviews: cas.interviews });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setCasMode: (on) => {
    writeLocal(CAS_MODE_KEY, on ? '1' : '0');
    set({ casMode: on });
    if (on) void get().loadCas();
  },

  markReviewed: () => {
    const now = new Date().toISOString();
    writeLocal(LAST_REVIEW_KEY, now);
    set({ lastReviewedAt: now });
  },

  // ── Items ──────────────────────────────────────────────────────────────────

  createItem: async (input) => {
    const item = await api.tracker.createItem(input);
    set({ items: [...get().items, item] });
    return item;
  },

  updateItem: async (id, fields) => {
    const before = get().items.find((i) => i.id === id);
    const item = await api.tracker.updateItem(id, fields);
    set({ items: get().items.map((i) => (i.id === id ? item : i)) });
    if (fields.status === 'DONE' && before?.status !== 'DONE') duckReact('trackerDone');
    else if (fields.status === 'DROPPED' && before?.status !== 'DROPPED') duckReact('dropped');
    return item;
  },

  dropItem: async (id) => {
    const item = await api.tracker.dropItem(id);
    set({ items: get().items.map((i) => (i.id === id ? item : i)) });
    duckReact('dropped');
  },

  deleteItem: async (id) => {
    await api.tracker.deleteItem(id);
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  scheduleItem: async (id) => {
    const { item, quest } = await api.tracker.schedule(id);
    set({
      items: get().items.map((i) => (i.id === id ? item : i)),
      linkedQuests: [
        ...get().linkedQuests.filter((q) => q.id !== quest.id),
        { id: quest.id, title: quest.title, status: quest.status },
      ],
    });
  },

  unscheduleItem: async (id) => {
    const item = await api.tracker.unschedule(id);
    set({ items: get().items.map((i) => (i.id === id ? item : i)) });
  },

  // ── Reflections ────────────────────────────────────────────────────────────

  addReflection: async (itemId, input) => {
    const reflection = await api.tracker.addReflection(itemId, input);
    duckReact('logged');
    set({
      items: get().items.map((i) =>
        i.id === itemId ? { ...i, reflections: [reflection, ...i.reflections] } : i,
      ),
    });
    // Reflections carry learning-outcome tags, so coverage may have changed.
    if (get().casMode) void get().loadCas();
  },

  deleteReflection: async (itemId, reflectionId) => {
    await api.tracker.deleteReflection(reflectionId);
    set({
      items: get().items.map((i) =>
        i.id === itemId
          ? { ...i, reflections: i.reflections.filter((r) => r.id !== reflectionId) }
          : i,
      ),
    });
    if (get().casMode) void get().loadCas();
  },

  // ── Domains ────────────────────────────────────────────────────────────────

  createDomain: async (input) => {
    const domain = await api.tracker.createDomain(input);
    set({ domains: [...get().domains, domain] });
  },

  updateDomain: async (id, fields) => {
    const domain = await api.tracker.updateDomain(id, fields);
    set({
      domains: get().domains.map((d) => (d.id === id ? domain : d)),
      // Items carry a denormalised domain name for display.
      items: get().items.map((i) =>
        i.domainId === id ? { ...i, domain: { name: domain.name } } : i,
      ),
    });
  },

  reorderDomains: async (ids) => {
    // Optimistic: the drag already moved it on screen, so don't wait to confirm.
    const byId = new Map(get().domains.map((d) => [d.id, d]));
    const optimistic = ids.map((id, sortOrder) => ({ ...byId.get(id)!, sortOrder }));
    set({ domains: optimistic });
    try {
      set({ domains: await api.tracker.reorderDomains(ids) });
    } catch (err) {
      set({ error: String(err) });
      await get().load();
    }
  },

  /** Items are not deleted — the server nulls their FK and they land in Unsorted. */
  deleteDomain: async (id) => {
    await api.tracker.deleteDomain(id);
    set({
      domains: get().domains.filter((d) => d.id !== id),
      items: get().items.map((i) => (i.domainId === id ? { ...i, domainId: null, domain: null } : i)),
    });
  },

  // ── Parking lot ────────────────────────────────────────────────────────────

  addParkingLot: async (text) => {
    const entry = await api.tracker.addParkingLot(text);
    set({ parkingLot: [entry, ...get().parkingLot] });
    duckReact('logged');
  },

  deleteParkingLot: async (id) => {
    await api.tracker.deleteParkingLot(id);
    set({ parkingLot: get().parkingLot.filter((e) => e.id !== id) });
  },

  promoteParkingLot: async (id, domainId) => {
    const item = await api.tracker.promoteParkingLot(id, { domainId: domainId ?? null });
    set({
      items: [...get().items, item],
      parkingLot: get().parkingLot.map((e) =>
        e.id === id ? { ...e, promotedToCode: item.code } : e,
      ),
    });
    return item;
  },

  // ── Decisions (append-only) ────────────────────────────────────────────────

  addDecision: async (text) => {
    const entry = await api.tracker.addDecision(text);
    set({ decisions: [entry, ...get().decisions] });
    duckReact('logged');
  },

  updateInterview: async (ordinal, fields) => {
    const row = await api.tracker.updateInterview(ordinal, fields);
    set({ interviews: get().interviews.map((i) => (i.ordinal === ordinal ? row : i)) });
  },

  // ── Presets ────────────────────────────────────────────────────────────────

  saveConfig: async (overrides) => {
    const res = await api.tracker.saveConfig(overrides);
    set({ config: res.config, overrides: res.overrides });
  },

  resetConfig: async () => {
    const res = await api.tracker.resetConfig();
    set({ config: res.config, overrides: res.overrides });
  },
}));
