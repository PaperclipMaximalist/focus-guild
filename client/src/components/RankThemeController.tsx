import { useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { levelFromXP } from '../lib/levels';
import { applyRankAccent, rememberAccent } from '../lib/theme';

/**
 * Null-rendering controller: watches the user's XP → rank accent and applies
 * it to the document's CSS variables whenever the rank changes. Mounted once
 * in App so the whole tree re-skins on level up.
 */
export function RankThemeController() {
  const totalXP = useUserStore((s) => s.user?.totalXP ?? 0);
  const accent = levelFromXP(totalXP).accent;

  useEffect(() => {
    rememberAccent(accent);
    applyRankAccent(accent);
  }, [accent]);

  return null;
}
