import { setSfxEnabled } from '../lib/sfx';
import { useSfxEnabled } from './useSfxEnabled';
import { Volume2, VolumeX } from 'lucide-react';

/** Small speaker toggle for the Header. */
export function SoundToggle() {
  const on = useSfxEnabled();
  return (
    <button
      onClick={() => setSfxEnabled(!on)}
      title={on ? 'Mute sound effects' : 'Enable sound effects'}
      aria-label={on ? 'Mute sound effects' : 'Enable sound effects'}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-(--color-border) text-(--color-muted) transition-colors hover:border-(--color-muted) hover:text-(--color-text)"
    >
      {on ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
    </button>
  );
}
