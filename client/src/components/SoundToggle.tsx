import { useEffect, useState } from 'react';
import { isSfxEnabled, setSfxEnabled, subscribeSfx } from '../lib/sfx';

/** React hook that mirrors the sfx-enabled flag and re-renders on change. */
export function useSfxEnabled(): boolean {
  const [on, setOn] = useState(isSfxEnabled());
  useEffect(() => subscribeSfx(() => setOn(isSfxEnabled())), []);
  return on;
}

/** Small speaker toggle for the Header. */
export function SoundToggle() {
  const on = useSfxEnabled();
  return (
    <button
      onClick={() => setSfxEnabled(!on)}
      title={on ? 'Mute sound effects' : 'Enable sound effects'}
      aria-label={on ? 'Mute sound effects' : 'Enable sound effects'}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-(--color-border) bg-white/5 text-base transition hover:bg-white/15"
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}
