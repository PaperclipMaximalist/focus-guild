import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCheckInStore } from '../store/useCheckInStore';
import { BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Zap } from 'lucide-react';

// A battery that fills with the level: readable without colour or faces.
const ENERGY_LABELS = [
  { label: 'Fried', Icon: BatteryWarning },
  { label: 'Low', Icon: BatteryLow },
  { label: 'Meh', Icon: BatteryMedium },
  { label: 'Good', Icon: BatteryFull },
  { label: 'Peak', Icon: Zap },
] as const;

export default function CheckIn() {
  const { today, submit, load } = useCheckInStore();
  const navigate = useNavigate();

  const [energy, setEnergy] = useState(3);
  const [hours, setHours] = useState(8);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (today) {
      setEnergy(today.energyLevel);
      setHours(Math.round(today.availableMinutes / 60));
    }
  }, [today]);

  const save = async () => {
    setSaving(true);
    try {
      await submit({ energyLevel: energy, availableMinutes: hours * 60 });
      navigate('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8 flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold text-(--color-text)">Daily Check-In</h1>
        <p className="mt-2 text-(--color-muted)">
          How's your brain today? This shapes how the Guild orders your quests.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <label className="text-sm text-(--color-text)">Energy level</label>
        <div className="grid grid-cols-5 gap-2">
          {ENERGY_LABELS.map(({ label, Icon }, i) => {
            const v = i + 1;
            return (
              <button
                key={v}
                onClick={() => setEnergy(v)}
                aria-pressed={energy === v}
                className={`rounded-lg border p-3 text-sm transition-colors ${
                  energy === v
                    ? 'border-(--color-primary) bg-(--color-primary)/15 text-(--color-text)'
                    : 'border-(--color-border) text-(--color-muted) hover:border-(--color-muted)'
                }`}
              >
                <span className="flex flex-col items-center gap-1"><Icon size={20} aria-hidden />{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <label className="text-sm text-(--color-text)">
          Available hours today: <span className="font-medium text-(--color-text)">{hours}h</span>
        </label>
        <input
          type="range"
          min={1}
          max={16}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
      </section>

      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-(--color-primary) px-4 py-3 font-medium text-(--color-on-primary) hover:bg-(--color-primary-d) disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : 'Save & view today'}
      </button>
    </div>
  );
}
