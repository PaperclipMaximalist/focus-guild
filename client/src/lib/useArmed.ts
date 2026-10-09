import { useEffect, useState } from 'react';

/**
 * Two taps instead of a browser confirm box.
 *
 * The first tap arms the button (show a different label while `armed === key`),
 * the second runs the action. Left alone, it disarms itself. Use this only
 * where Undo is not possible; where it is, delete and offer Undo instead.
 */
export function useArmed(ms = 3500) {
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (armed === null) return;
    const t = setTimeout(() => setArmed(null), ms);
    return () => clearTimeout(t);
  }, [armed, ms]);

  const fire = (key: string, run: () => void) => {
    if (armed === key) {
      setArmed(null);
      run();
    } else {
      setArmed(key);
    }
  };

  return { armed, fire };
}
