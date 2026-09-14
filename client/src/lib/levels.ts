import type { LucideIcon } from 'lucide-react';
import { CloudFog, Crown, Flame, Gem, Shield, Star, Swords } from 'lucide-react';
// Guild Levels & Titles — defined in FocusGuildInstructions.md.
// Each rank has a colour; it tints the rank badge and XP bar (lib/theme.ts).

export interface GuildLevel {
  level: number;
  title: string;
  xpRequired: number;
  accent: string; // hex; drives theme accent
  icon: LucideIcon; // rank emblem
}

export const LEVELS: GuildLevel[] = [
  { level: 1, title: 'Foggy Brain',       xpRequired: 0,     accent: '#8A8478', icon: CloudFog },
  { level: 2, title: 'Task Apprentice',   xpRequired: 500,   accent: '#199E70', icon: Swords },
  { level: 3, title: 'Focus Wielder',     xpRequired: 1500,  accent: '#3987E5', icon: Shield },
  { level: 4, title: 'Deadline Slayer',   xpRequired: 3500,  accent: '#D95926', icon: Flame },
  { level: 5, title: 'Flow Master',       xpRequired: 7000,  accent: '#9085E9', icon: Gem },
  { level: 6, title: 'Guild Champion',    xpRequired: 13000, accent: '#D55181', icon: Crown },
  { level: 7, title: 'Legendary Quester', xpRequired: 25000, accent: '#F2B33D', icon: Star },
];

export function levelFromXP(totalXP: number): GuildLevel {
  let current = LEVELS[0]!;
  for (const l of LEVELS) {
    if (totalXP >= l.xpRequired) current = l;
    else break;
  }
  return current;
}

export function nextLevel(totalXP: number): GuildLevel | null {
  const current = levelFromXP(totalXP);
  return LEVELS.find((l) => l.level === current.level + 1) ?? null;
}

export function progressToNextLevel(totalXP: number): {
  pct: number;
  earned: number;
  needed: number;
} {
  const current = levelFromXP(totalXP);
  const next = nextLevel(totalXP);
  if (!next) return { pct: 100, earned: totalXP - current.xpRequired, needed: 0 };
  const earned = totalXP - current.xpRequired;
  const needed = next.xpRequired - current.xpRequired;
  return { pct: Math.min(100, (earned / needed) * 100), earned, needed };
}
