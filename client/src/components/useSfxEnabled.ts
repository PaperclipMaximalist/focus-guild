import { useEffect, useState } from 'react';
import { isSfxEnabled, subscribeSfx } from '../lib/sfx';

/** React hook that mirrors the sfx-enabled flag and re-renders on change. */
export function useSfxEnabled(): boolean {
  const [on, setOn] = useState(isSfxEnabled());
  useEffect(() => subscribeSfx(() => setOn(isSfxEnabled())), []);
  return on;
}
