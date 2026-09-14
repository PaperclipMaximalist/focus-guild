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
        <h1 className="text-3xl font-bold text-slate-100">Daily Check-In</h1>
        <p className="mt-2 text-slate-400">
          How's your brain today? This shapes how the Guild orders your quests.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <label className="text-sm text-slate-300">Energy level</label>
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
                    ? 'border-violet-500 bg-violet-500/20 text-violet-100'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span className="flex flex-col items-center gap-1"><Icon size={20} aria-hidden />{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <label className="text-sm text-slate-300">
          Available hours today: <span className="font-medium text-slate-100">{hours}h</span>
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
        className="rounded-lg bg-violet-600 px-4 py-3 font-medium text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : 'Save & view today'}
      </button>
    </div>
  );
}
