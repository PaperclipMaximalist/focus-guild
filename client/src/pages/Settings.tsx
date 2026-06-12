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
  type SchedulerConfigShape,
  type ScoreWeights,
  type WorkingHours,
} from '../lib/api';
import { useToastStore } from '../components/Toasts';
import { InfoTip } from '../components/InfoTip';

const WEIGHT_INFO: Record<keyof ScoreWeights, { label: string; help: string }> = {
  energy: {
    label: '⚡ Energy match',
    help: 'How strongly hard tasks are pulled into your high-capacity hours (morning peak, late-afternoon recovery) and easy ones into the post-lunch dip. Raise = stricter time-of-day matching.',
  },
  urgency: {
    label: '⏰ Deadline pressure',
    help: 'How much a closing deadline pulls a quest earlier. Only kicks in when slack is genuinely tight — a quest with days of buffer is not rushed. Raise if deadline work feels late; lower if everything stampedes to the front.',
  },
  monotony: {
    label: '🎨 Variety',
    help: 'Penalty for runs of same-flavor work (same category + difficulty + tedium). The variety floor hard-caps runs at 2 in a row; this weight shapes how hard the scheduler avoids even getting close. Raise for more interleaving.',
  },
  batch: {
    label: '📎 Batch small admin',
    help: 'Small bonus for chaining short admin/comms tasks back-to-back so you stay in shallow-work mode and knock them out together. Only applies to chunks ≤ 30min.',
  },
  tedium: {
    label: '😩 Spread the boring',
    help: 'Penalty for two high-tedium blocks back-to-back. Raise if you keep getting boring-then-boring; the scheduler will sandwich tedious work between engaging blocks.',
  },
  cooldown: {
    label: '🧠 Mental cooldown',
    help: 'Penalty for two high-difficulty blocks back-to-back. Raise to force a lighter task (or a gap) between brain-melters.',
  },
  session: {
    label: '⏳ Session sizing',
    help: 'How strictly chunks stick to their ideal size (big tasks: 30–90min sessions, medium: 20–60, small: one sitting). Raise = more uniform sessions; lower = scheduler freely uses odd-sized gaps.',
  },
};

// Display order: the two main forces, then variety, then the fine-tuners.
const WEIGHT_ORDER: Array<keyof ScoreWeights> = [
  'energy', 'urgency', 'monotony', 'batch', 'tedium', 'cooldown', 'session',
];

export default function Settings() {
  const pushToast = useToastStore((s) => s.push);
  const [loaded, setLoaded] = useState(false);
  const [defaults, setDefaults] = useState<SchedulerConfigShape | null>(null);
  const [overrides, setOverrides] = useState<Partial<SchedulerConfigShape>>({});
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    api.settings
      .get()
      .then(({ defaults, overrides }) => {
        setDefaults(defaults);
        // Old persisted overrides may carry legacy keys (weights, breakPolicy)
        // — keep only the fields this UI knows so we never re-save dead knobs.
        const { scoreWeights, workingHours, horizonDays, softMaxBlockMin } =
          (overrides ?? {}) as Partial<SchedulerConfigShape>;
        setOverrides({
          ...(scoreWeights ? { scoreWeights } : {}),
          ...(workingHours ? { workingHours } : {}),
          ...(horizonDays !== undefined ? { horizonDays } : {}),
          ...(softMaxBlockMin !== undefined ? { softMaxBlockMin } : {}),
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
    return out;
  };

  const hasChanges = Object.keys(diffFromDefault()).length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = diffFromDefault();
      await api.settings.save(payload);
      pushToast({ icon: '⚙️', title: 'Settings saved', sub: 'Next reflow will use them', variant: 'xp' });
    } catch (e) {
      pushToast({ icon: '⚠️', title: 'Save failed', sub: String(e), variant: 'xp' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    setResetting(true);
    try {
      await api.settings.reset();
      setOverrides({});
      pushToast({ icon: '↺', title: 'Reset to defaults', sub: '', variant: 'xp' });
    } finally {
      setResetting(false);
    }
  };

  if (!loaded || !defaults || !current) {
    return <div className="p-8" style={{ color: 'var(--color-muted)' }}>Loading…</div>;
  }

  const updateWeight = (k: keyof ScoreWeights, v: number) => {
    setOverrides((prev) => ({ ...prev, scoreWeights: { ...(prev.scoreWeights ?? {}), [k]: v } as ScoreWeights }));
  };
  const updateHours = (k: keyof WorkingHours, v: number) => {
    setOverrides((prev) => ({ ...prev, workingHours: { ...(prev.workingHours ?? {}), [k]: v } as WorkingHours }));
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-5">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-text)' }}>
          ⚙️ Settings
        </h1>
        <Link to="/" className="text-sm" style={{ color: 'var(--color-primary)' }}>
          ← Today
        </Link>
      </header>

      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        Tune the scheduler. Changes apply on the next <b>Reflow day</b> on the Guild Feed.
        Every knob has an ⓘ explaining its effect — the defaults are good; only move what bothers you.
      </p>

      {/* Working hours */}
      <Section title="🕘 Working hours">
        <Row label="Day starts at" hint="When the scheduler starts placing work blocks (your local time).">
          <HourInput value={current.workingHours.startHour} onChange={(v) => updateHours('startHour', v)} />
        </Row>
        <Row label="Day ends at" hint="When the scheduler stops placing work blocks (your local time).">
          <HourInput value={current.workingHours.endHour} onChange={(v) => updateHours('endHour', v)} />
        </Row>
        <Row label="Planning horizon" hint="How many days the scheduler plans ahead. Big tasks spread toward their deadline across this window.">
          <NumberInput min={1} max={30} value={current.horizonDays} onChange={(v) => setOverrides((p) => ({ ...p, horizonDays: v }))} suffix="days" />
        </Row>
        <Row label="Longest single block" hint="Soft cap on one sitting. Lifted automatically for tasks with heavy setup cost or a rushed deadline.">
          <NumberInput min={15} max={480} step={15} value={current.softMaxBlockMin} onChange={(v) => setOverrides((p) => ({ ...p, softMaxBlockMin: v }))} suffix="min" />
        </Row>
      </Section>

      {/* Scoring weights */}
      <Section title="🎚 Day-building priorities">
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

      {/* Action bar */}
      <div className="sticky bottom-20 z-40 flex items-center justify-between gap-2 rounded-full border px-4 py-2.5 shadow-xl"
        style={{
          background: 'var(--color-surface)',
          borderColor: hasChanges ? 'rgba(245,158,11,0.5)' : 'var(--color-border)',
        }}
      >
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {hasChanges ? '⚡ Unsaved changes' : 'Everything saved'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="text-xs rounded-full border px-3 py-1.5 font-semibold disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {resetting ? '…' : '↺ Reset all'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="text-xs rounded-full px-4 py-1.5 font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {saving ? '…' : 'Save'}
          </button>
        </div>
      </div>
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
          <span className="text-[0.7rem]" style={{ color: 'var(--color-muted)' }}>
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

function HourInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border bg-white/5 px-2 py-1 text-sm outline-none"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
    >
      {Array.from({ length: 25 }, (_, i) => (
        <option key={i} value={i}>
          {String(i).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  );
}
