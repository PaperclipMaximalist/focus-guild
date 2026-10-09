/**
 * Settings — live tuning of the scheduler.
 *
 * GET /settings returns { defaults, overrides }. We seed every slider
 * from defaults, then overlay any user overrides. Save sends a partial
 * (only fields that differ from default).
 *
 * Exposes exactly the knobs the planner actually reads:
 *   - workingHours + horizonDays + softMaxBlockMin (structure)
 *   - the 7 ScoreWeights (per-decision scoring)
 * The pre-revamp 9-weight set and break policy are gone — the new
 * constructor derives breaks from gaps and reads none of those fields.
 */

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type Chronotype,
  type SchedulerConfigShape,
  type ScoreWeights,
  type WorkingHours,
} from '../lib/api';
import { useToastStore } from '../components/Toasts';
import { InfoTip } from '../components/InfoTip';
import {
  isSfxEnabled, setSfxEnabled, isHapticsEnabled, setHapticsEnabled, subscribeSfx, sfxClick,
} from '../lib/sfx';
import { isRankThemeEnabled, setRankThemeEnabled, subscribeTheme } from '../lib/theme';
import { useMascotStore } from '../store/useMascotStore';
import { ChevronRight, Plug, RotateCcw, SettingsIcon, TriangleAlert } from 'lucide-react';
import { useArmed } from '../lib/useArmed';

const WEIGHT_INFO: Record<keyof ScoreWeights, { label: string; help: string }> = {
  energy: {
    label: 'Energy match',
    help: 'How strongly hard tasks are pulled into your high-capacity hours (morning peak, late-afternoon recovery) and easy ones into the post-lunch dip. Raise = stricter time-of-day matching.',
  },
  urgency: {
    label: 'Deadline pressure',
    help: 'How much a closing deadline pulls a quest earlier. Only kicks in when slack is genuinely tight — a quest with days of buffer is not rushed. Raise if deadline work feels late; lower if everything stampedes to the front.',
  },
  monotony: {
    label: 'Variety',
    help: 'Penalty for runs of same-flavor work (same category + difficulty + tedium). The variety floor hard-caps runs at 2 in a row; this weight shapes how hard the scheduler avoids even getting close. Raise for more interleaving.',
  },
  batch: {
    label: 'Batch small admin',
    help: 'Small bonus for chaining short admin/comms tasks back-to-back so you stay in shallow-work mode and knock them out together. Only applies to chunks ≤ 30min.',
  },
  tedium: {
    label: 'Spread the boring',
    help: 'Penalty for two high-tedium blocks back-to-back. Raise if you keep getting boring-then-boring; the scheduler will sandwich tedious work between engaging blocks.',
  },
  cooldown: {
    label: 'Mental cooldown',
    help: 'Penalty for two high-difficulty blocks back-to-back. Raise to force a lighter task (or a gap) between brain-melters.',
  },
  session: {
    label: 'Session sizing',
    help: 'How strictly chunks stick to their ideal size (big tasks: 30–90min sessions, medium: 20–60, small: one sitting). Raise = more uniform sessions; lower = scheduler freely uses odd-sized gaps.',
  },
  prefHour: {
    label: 'Preferred time',
    help: 'How strongly a quest\'s "preferred hour" pulls it toward that time of day (σ≈2h). Only affects quests where you set one. Raise for stricter honoring; 0 to ignore preferences.',
  },
};

const CHRONOTYPES: Array<{ id: Chronotype; label: string; peak: string }> = [
  { id: 'lark', label: 'Morning', peak: '7–11' },
  { id: 'standard', label: 'Standard', peak: '9–11, 16–17' },
  { id: 'afternoon', label: 'Afternoon', peak: '13–17' },
  { id: 'owl', label: 'Night owl', peak: '19–24' },
];

// Display order: the two main forces, then variety, then the fine-tuners.
const WEIGHT_ORDER: Array<keyof ScoreWeights> = [
  'energy', 'urgency', 'monotony', 'prefHour', 'batch', 'tedium', 'cooldown', 'session',
];

export default function Settings() {
  const pushToast = useToastStore((s) => s.push);
  const [loaded, setLoaded] = useState(false);
  const [defaults, setDefaults] = useState<SchedulerConfigShape | null>(null);
  const [overrides, setOverrides] = useState<Partial<SchedulerConfigShape>>({});
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { armed, fire } = useArmed();

  useEffect(() => {
    api.settings
      .get()
      .then(({ defaults, overrides }) => {
        setDefaults(defaults);
        // Old persisted overrides may carry legacy keys (weights, breakPolicy)
        // — keep only the fields this UI knows so we never re-save dead knobs.
        const { scoreWeights, workingHours, horizonDays, softMaxBlockMin, chronotype } =
          (overrides ?? {}) as Partial<SchedulerConfigShape>;
        setOverrides({
          ...(scoreWeights ? { scoreWeights } : {}),
          ...(workingHours ? { workingHours } : {}),
          ...(horizonDays !== undefined ? { horizonDays } : {}),
          ...(softMaxBlockMin !== undefined ? { softMaxBlockMin } : {}),
          ...(chronotype ? { chronotype } : {}),
        });
      })
      .finally(() => setLoaded(true));
  }, []);

  // Merge defaults + overrides for display.
  const current = useMemo<SchedulerConfigShape | null>(() => {
    if (!defaults) return null;
    return {
      scoreWeights: { ...defaults.scoreWeights, ...(overrides.scoreWeights ?? {}) },
      workingHours: { ...defaults.workingHours, ...(overrides.workingHours ?? {}) },
      horizonDays: overrides.horizonDays ?? defaults.horizonDays,
      softMaxBlockMin: overrides.softMaxBlockMin ?? defaults.softMaxBlockMin,
      chronotype: overrides.chronotype ?? defaults.chronotype ?? 'standard',
    };
  }, [defaults, overrides]);

  // Compute only the deltas from default so we don't store noise.
  const diffFromDefault = (): Partial<SchedulerConfigShape> => {
    if (!defaults || !current) return {};
    const out: Partial<SchedulerConfigShape> = {};

    const weightDiff: Partial<ScoreWeights> = {};
    (Object.keys(current.scoreWeights) as Array<keyof ScoreWeights>).forEach((k) => {
      if (current.scoreWeights[k] !== defaults.scoreWeights[k]) weightDiff[k] = current.scoreWeights[k];
    });
    if (Object.keys(weightDiff).length) out.scoreWeights = weightDiff as ScoreWeights;

    const hoursDiff: Partial<WorkingHours> = {};
    (Object.keys(current.workingHours) as Array<keyof WorkingHours>).forEach((k) => {
      if (current.workingHours[k] !== defaults.workingHours[k]) hoursDiff[k] = current.workingHours[k];
    });
    if (Object.keys(hoursDiff).length) out.workingHours = hoursDiff as WorkingHours;

    if (current.horizonDays !== defaults.horizonDays) out.horizonDays = current.horizonDays;
    if (current.softMaxBlockMin !== defaults.softMaxBlockMin) out.softMaxBlockMin = current.softMaxBlockMin;
    if (current.chronotype !== (defaults.chronotype ?? 'standard')) out.chronotype = current.chronotype;
    return out;
  };

  const hasChanges = Object.keys(diffFromDefault()).length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = diffFromDefault();
      await api.settings.save(payload);
      pushToast({ icon: SettingsIcon, title: 'Settings saved', sub: 'Next reflow will use them', variant: 'xp' });
    } catch (e) {
      pushToast({ icon: TriangleAlert, title: 'Save failed', sub: String(e), variant: 'xp' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.settings.reset();
      setOverrides({});
      pushToast({ icon: RotateCcw, title: 'Reset to defaults', sub: '', variant: 'xp' });
    } finally {
      setResetting(false);
    }
  };

  if (!loaded || !defaults || !current) {
    return (
      <div className="page flex flex-col gap-5" aria-busy="true" aria-label="Loading settings">
        <div className="skeleton h-8 w-36" />
        <div className="skeleton h-16" />
        <div className="skeleton h-72" />
      </div>
    );
  }

  const updateWeight = (k: keyof ScoreWeights, v: number) => {
    setOverrides((prev) => ({ ...prev, scoreWeights: { ...(prev.scoreWeights ?? {}), [k]: v } as ScoreWeights }));
  };
  const updateHours = (k: keyof WorkingHours, v: number) => {
    setOverrides((prev) => ({ ...prev, workingHours: { ...(prev.workingHours ?? {}), [k]: v } as WorkingHours }));
  };

  return (
    <div className="page flex flex-col gap-5">
      <header>
        <h1 className="page-title">Settings</h1>
        <p className="mt-1.5 text-sm text-(--color-muted)">
          How the planner builds your day. Changes apply the next time the Feed replans. The defaults are good; only
          move what bothers you.
        </p>
      </header>

      <Link
        to="/connections"
        className="panel flex items-center gap-3 px-4 py-3 transition-colors hover:bg-(--color-surface2)"
      >
        <Plug size={18} aria-hidden style={{ color: 'var(--color-primary)' }} />
        <span className="flex-1">
          <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Connections</span>
          <span className="block text-xs" style={{ color: 'var(--color-muted)' }}>
            Calendars the planner works around, and an inbox for Teams, phone shortcuts and more
          </span>
        </span>
        <ChevronRight size={16} aria-hidden style={{ color: 'var(--color-muted)' }} />
      </Link>

      {/* Working hours */}
      <Section title="Working hours">
        <Row label="Day starts at" hint="When the scheduler starts placing work blocks (your local time).">
          {/* A day can't start at 24:00; the server takes 00:00–23:30. */}
          <HourInput value={current.workingHours.startHour} onChange={(v) => updateHours('startHour', v)} last={23.5} />
        </Row>
        <Row label="Day ends at" hint="When the scheduler stops placing work blocks (your local time). An end earlier than the start means the next day: 22:00 to 06:00 is a night shift.">
          <HourInput value={current.workingHours.endHour} onChange={(v) => updateHours('endHour', v)} />
        </Row>
        <HoursNote hours={current.workingHours} />
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm" style={{ color: 'var(--color-text)' }}>Sharpest time of day</span>
            <InfoTip>Where the planner puts your heaviest quests. Standard is an office day (peak mid-morning, second wind late afternoon); pick the one that matches when hard thinking actually works for you.</InfoTip>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Sharpest time of day">
            {CHRONOTYPES.map((c) => {
              const on = current.chronotype === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setOverrides((p) => ({ ...p, chronotype: c.id }))}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    on
                      ? 'border-(--color-primary) bg-(--color-primary)/15 text-(--color-text)'
                      : 'border-(--color-border) text-(--color-muted) hover:border-(--color-muted)'
                  }`}
                >
                  <span className="block text-sm font-semibold">{c.label}</span>
                  <span className="block text-xs font-mono" style={{ color: 'var(--color-muted)' }}>{c.peak}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Row label="Planning horizon" hint="How many days the scheduler plans ahead. Big tasks spread toward their deadline across this window.">
          <NumberInput min={1} max={30} value={current.horizonDays} onChange={(v) => setOverrides((p) => ({ ...p, horizonDays: v }))} suffix="days" />
        </Row>
        <Row label="Longest single block" hint="Soft cap on one sitting. Lifted automatically for tasks with heavy setup cost or a rushed deadline.">
          <NumberInput min={15} max={480} step={15} value={current.softMaxBlockMin} onChange={(v) => setOverrides((p) => ({ ...p, softMaxBlockMin: v }))} suffix="min" />
        </Row>
      </Section>

      {/* Scoring weights */}
      <Section title="Day-building priorities">
        <p className="text-xs mb-2 px-1" style={{ color: 'var(--color-muted)' }}>
          Each slider sets how much that force matters when the scheduler picks what goes
          in each slot. They're relative to each other — doubling everything changes nothing.
        </p>
        {WEIGHT_ORDER.map((k) => (
          <SliderRow
            key={k}
            label={WEIGHT_INFO[k].label}
            help={WEIGHT_INFO[k].help}
            value={current.scoreWeights[k]}
            defaultValue={defaults.scoreWeights[k]}
            min={0}
            max={4}
            step={0.1}
            onChange={(v) => updateWeight(k, v)}
          />
        ))}
      </Section>

      {/* Experience (client-side, saved instantly to this device) */}
      <ExperienceSection />

      {/* Action bar */}
      <div className="sticky bottom-20 z-40 flex items-center justify-between gap-2 rounded-md border px-4 py-2.5 shadow-xl"
        style={{
          background: 'var(--color-surface)',
          borderColor: hasChanges ? 'color-mix(in srgb, var(--color-gold) 50%, transparent)' : 'var(--color-border)',
        }}
      >
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {hasChanges ? 'Unsaved changes' : 'Everything saved'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => fire('reset', handleReset)}
            disabled={resetting}
            className="text-xs rounded-md border px-3 py-1.5 font-semibold disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {resetting ? '…' : <span className="inline-flex items-center gap-1.5"><RotateCcw size={12} aria-hidden /> {armed === 'reset' ? 'Tap again to reset' : 'Reset all'}</span>}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || hoursAreEmpty(current.workingHours)}
            className="text-xs rounded-md px-4 py-1.5 font-semibold text-(--color-on-primary) disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {saving ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Experience section (client-only toggles, persisted to localStorage) ──────

function ExperienceSection() {
  const duck = useMascotStore((s) => s.enabled);
  const setDuck = useMascotStore((s) => s.setEnabled);
  const [sfx, setSfx] = useState(isSfxEnabled());
  const [haptics, setHaptics] = useState(isHapticsEnabled());
  const [rankTheme, setRankTheme] = useState(isRankThemeEnabled());

  useEffect(() => {
    const unsubSfx = subscribeSfx(() => { setSfx(isSfxEnabled()); setHaptics(isHapticsEnabled()); });
    const unsubTheme = subscribeTheme(() => setRankTheme(isRankThemeEnabled()));
    return () => { unsubSfx(); unsubTheme(); };
  }, []);

  return (
    <Section title="Experience">
      <p className="text-xs mb-2 px-1" style={{ color: 'var(--color-muted)' }}>
        Saved instantly to this device.
      </p>
      <Toggle
        label="Sound effects"
        hint="Plays a little chime when you finish a quest, level up, or unlock an achievement."
        on={sfx}
        onChange={(v) => { setSfxEnabled(v); if (v) sfxClick(); }}
      />
      <Toggle
        label="Haptics"
        hint="Subtle vibration feedback on supported phones."
        on={haptics}
        onChange={(v) => setHapticsEnabled(v)}
      />
      <Toggle
        label="Rubber duck"
        hint="A small duck in the corner that cheers you on. Tap it for a pep talk. Turn it off if it's distracting."
        on={duck}
        onChange={(v) => setDuck(v)}
      />
      <Toggle
        label="Rank theming"
        hint="Colours your rank badge and XP bar by guild rank, so levelling up shows."
        on={rankTheme}
        onChange={(v) => setRankThemeEnabled(v)}
      />
    </Section>
  );
}

function Toggle({
  label, hint, on, onChange,
}: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm" style={{ color: 'var(--color-text)' }}>{label}</span>
        <InfoTip>{hint}</InfoTip>
      </div>
      <button
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: on ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)' }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left,transform]"
          style={{ left: on ? '22px' : '2px' }}
        />
      </button>
    </div>
  );
}

// ─── UI primitives ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-(--radius-card) border p-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm" style={{ color: 'var(--color-text)' }}>{label}</span>
        {hint && <InfoTip>{hint}</InfoTip>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SliderRow({
  label, help, value, defaultValue, min, max, step, onChange,
}: {
  label: string; help: string; value: number; defaultValue: number;
  min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  const isDefault = value === defaultValue;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>{label}</span>
          <InfoTip>{help}</InfoTip>
          <span className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
            (default {defaultValue})
          </span>
        </div>
        <span
          className="text-xs font-mono font-bold tabular-nums"
          style={{ color: isDefault ? 'var(--color-muted)' : 'var(--color-gold)' }}
        >
          {value.toFixed(1)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: 'var(--color-primary)' }}
      />
    </div>
  );
}

function NumberInput({
  value, onChange, min, max, step = 1, suffix,
}: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="w-20 rounded-md border bg-white/5 px-2 py-1 text-sm text-right outline-none"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      />
      {suffix && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{suffix}</span>}
    </div>
  );
}

const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

/** Hours that start and end at the same time leave nothing to plan (the server refuses them too). */
function hoursAreEmpty({ startHour, endHour }: WorkingHours): boolean {
  return startHour === endHour;
}

/**
 * What the two hour pickers add up to when it isn't obvious. 22:00–06:00 used
 * to save without a word and then plan nothing at all; now it is a night
 * shift, and the page says so before the Save.
 */
function HoursNote({ hours }: { hours: WorkingHours }) {
  const { startHour, endHour } = hours;
  if (hoursAreEmpty(hours)) {
    return (
      <p role="alert" className="text-xs px-1" style={{ color: 'var(--color-fire)' }}>
        The day starts and ends at {fmtHour(startHour)}, which leaves no time to plan. Pick a later end,
        or an earlier one for hours that run past midnight.
      </p>
    );
  }
  if (endHour > startHour) return null;
  const span = endHour + 24 - startHour;
  return (
    <p className="text-xs px-1" style={{ color: 'var(--color-muted)' }}>
      Runs past midnight: {fmtHour(startHour)} to {fmtHour(endHour)} the next day ({span} h).
      {endHour > 0 && <> Your day turns over at {fmtHour(endHour)} instead of midnight, so Not Today lasts until then.</>}
    </p>
  );
}

function HourInput({ value, onChange, last = 24 }: { value: number; onChange: (v: number) => void; last?: number }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border bg-white/5 px-2 py-1 text-sm outline-none"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
    >
      {Array.from({ length: last * 2 + 1 }, (_, i) => i / 2).map((h) => (
        <option key={h} value={h}>
          {fmtHour(h)}
        </option>
      ))}
    </select>
  );
}
