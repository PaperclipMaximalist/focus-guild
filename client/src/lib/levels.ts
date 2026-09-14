import type { LucideIcon } from 'lucide-react';
import { CloudFog, Crown, Flame, Gem, Shield, Star, Swords } from 'lucide-react';
// Guild Levels & Titles — defined in FocusGuildInstructions.md.
// Each level unlocks a visual theme via the accent color below.

export interface GuildLevel {
  level: number;
  title: string;
  xpRequired: number;
  accent: string; // hex; drives theme accent
  icon: LucideIcon; // rank emblem
}

export const LEVELS: GuildLevel[] = [
  { level: 1, title: 'Foggy Brain',       xpRequired: 0,     accent: '#94a3b8', icon: CloudFog },
  { level: 2, title: 'Task Apprentice',   xpRequired: 500,   accent: '#22d3ee', icon: Swords },
  { level: 3, title: 'Focus Wielder',     xpRequired: 1500,  accent: '#3b82f6', icon: Shield },
  { level: 4, title: 'Deadline Slayer',   xpRequired: 3500,  accent: '#a855f7', icon: Flame },
  { level: 5, title: 'Flow Master',       xpRequired: 7000,  accent: '#ec4899', icon: Gem },
  { level: 6, title: 'Guild Champion',    xpRequired: 13000, accent: '#f59e0b', icon: Crown },
  { level: 7, title: 'Legendary Quester', xpRequired: 25000, accent: '#facc15', icon: Star },
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
