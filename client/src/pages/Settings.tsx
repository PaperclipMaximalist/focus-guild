/**
 * Settings — live tuning of the scheduler.
 *
 * GET /settings returns { defaults, overrides }. We seed every slider
 * from defaults, then overlay any user overrides. Save sends a partial
 * (only fields that differ from default).
 */

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type SchedulerConfigShape,
  type SchedulerWeights,
  type BreakPolicy,
  type WorkingHours,
} from '../lib/api';
import { useToastStore } from '../components/Toasts';
import { InfoTip } from '../components/InfoTip';

const WEIGHT_INFO: Record<keyof SchedulerWeights, { label: string; help: string }> = {
  urgency:       { label: 'Urgency',       help: 'Deadline pressure. Default 3.0 — dominant signal.' },
  staleness:     { label: 'Staleness',     help: 'Boost long-neglected quests. Raise if old tasks rot.' },
  timeFit:       { label: 'Time-of-day fit', help: 'How hard to honor preferredHour. Raise = stricter.' },
  energyFit:     { label: 'Energy fit',    help: 'Match cognitive load to energy curve. Raise = stricter.' },
  chunkFit:      { label: 'Chunk fit',     help: 'Reward chunks near maxChunkMin. Raise for longer focus.' },
  adjacency:     { label: 'Adjacency',     help: 'Penalty for tedious-after-tedious. Raise to spread the boring stuff.' },
  switch:        { label: 'Context switch', help: 'Penalty for category change. Raise to batch similar work.' },
  fragmentation: { label: 'Fragmentation', help: 'Penalty for too few/too many chunks per day vs target.' },
  oversize:      { label: 'Oversize',      help: 'Penalty for blocks above the 1.5h soft cap. Raise = stricter cap.' },
};

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
        setOverrides(overrides ?? {});
      })
      .finally(() => setLoaded(true));
  }, []);

  // Merge defaults + overrides for display.
  const current = useMemo<SchedulerConfigShape | null>(() => {
    if (!defaults) return null;
    return {
      weights: { ...defaults.weights, ...(overrides.weights ?? {}) },
      breakPolicy: { ...defaults.breakPolicy, ...(overrides.breakPolicy ?? {}) },
      workingHours: { ...defaults.workingHours, ...(overrides.workingHours ?? {}) },
      horizonDays: overrides.horizonDays ?? defaults.horizonDays,
      softMaxBlockMin: overrides.softMaxBlockMin ?? defaults.softMaxBlockMin,
    };
  }, [defaults, overrides]);

  // Compute only the deltas from default so we don't store noise.
  const diffFromDefault = (): Partial<SchedulerConfigShape> => {
    if (!defaults || !current) return {};
    const out: Partial<SchedulerConfigShape> = {};

    const weightDiff: Partial<SchedulerWeights> = {};
    (Object.keys(current.weights) as Array<keyof SchedulerWeights>).forEach((k) => {
      if (current.weights[k] !== defaults.weights[k]) weightDiff[k] = current.weights[k];
    });
    if (Object.keys(weightDiff).length) out.weights = weightDiff as SchedulerWeights;

    const breakDiff: Partial<BreakPolicy> = {};
    (Object.keys(current.breakPolicy) as Array<keyof BreakPolicy>).forEach((k) => {
      if (current.breakPolicy[k] !== defaults.breakPolicy[k]) breakDiff[k] = current.breakPolicy[k];
    });
    if (Object.keys(breakDiff).length) out.breakPolicy = breakDiff as BreakPolicy;

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
      pushToast({ icon: '⚙️', title: 'Settings saved', sub: 'Next replan will use them', variant: 'xp' });
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

  const updateWeight = (k: keyof SchedulerWeights, v: number) => {
    setOverrides((prev) => ({ ...prev, weights: { ...(prev.weights ?? {}), [k]: v } as SchedulerWeights }));
  };
  const updateBreak = (k: keyof BreakPolicy, v: number) => {
    setOverrides((prev) => ({ ...prev, breakPolicy: { ...(prev.breakPolicy ?? {}), [k]: v } as BreakPolicy }));
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
        Tune the scheduler. Changes apply on the next <b>Generate</b> or <b>Replan</b> on the Guild Feed.
        Every knob has an ⓘ explaining its effect.
      </p>

      {/* Working hours */}
      <Section title="🕘 Working hours">
        <Row label="Day starts at" hint="When the scheduler starts placing work blocks.">
          <HourInput value={current.workingHours.startHour} onChange={(v) => updateHours('startHour', v)} />
        </Row>
        <Row label="Day ends at" hint="When the scheduler stops placing work blocks.">
          <HourInput value={current.workingHours.endHour} onChange={(v) => updateHours('endHour', v)} />
        </Row>
        <Row label="Planning horizon" hint="How many days the scheduler plans ahead.">
          <NumberInput min={1} max={30} value={current.horizonDays} onChange={(v) => setOverrides((p) => ({ ...p, horizonDays: v }))} suffix="days" />
        </Row>
      </Section>

      {/* Breaks */}
      <Section title="☕ Break policy">
        <Row label="Short break every" hint="Insert a short break after this many minutes of contiguous work.">
          <NumberInput min={15} max={240} step={5} value={current.breakPolicy.shortBreakAfterMin} onChange={(v) => updateBreak('shortBreakAfterMin', v)} suffix="min" />
        </Row>
        <Row label="Short break length">
          <NumberInput min={1} max={60} value={current.breakPolicy.shortBreakDurationMin} onChange={(v) => updateBreak('shortBreakDurationMin', v)} suffix="min" />
        </Row>
        <Row label="Long break every" hint="Insert a longer break after this much cumulative work.">
          <NumberInput min={30} max={480} step={15} value={current.breakPolicy.longBreakAfterMin} onChange={(v) => updateBreak('longBreakAfterMin', v)} suffix="min" />
        </Row>
        <Row label="Long break length">
          <NumberInput min={5} max={120} step={5} value={current.breakPolicy.longBreakDurationMin} onChange={(v) => updateBreak('longBreakDurationMin', v)} suffix="min" />
        </Row>
      </Section>

      {/* Soft cap */}
      <Section title="🏛 Block size">
        <Row label="Soft cap on work block" hint="Discourages blocks longer than this. Special tasks (setupCost ≥ 0.7 OR urgencyMult ≥ 1.5) override.">
          <NumberInput min={15} max={480} step={15} value={current.softMaxBlockMin} onChange={(v) => setOverrides((p) => ({ ...p, softMaxBlockMin: v }))} suffix="min" />
        </Row>
      </Section>

      {/* Weights */}
      <Section title="🎚 Scoring weights">
        <p className="text-xs mb-2 px-1" style={{ color: 'var(--color-muted)' }}>
          Higher = bigger pull on the schedule. Default is shown to the right of each label.
        </p>
        {(Object.keys(WEIGHT_INFO) as Array<keyof SchedulerWeights>).map((k) => (
          <SliderRow
            key={k}
            label={WEIGHT_INFO[k].label}
            help={WEIGHT_INFO[k].help}
            value={current.weights[k]}
            defaultValue={defaults.weights[k]}
            min={0}
            max={5}
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
