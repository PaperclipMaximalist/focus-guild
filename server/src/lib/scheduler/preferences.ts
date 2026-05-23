/**
 * Soft preference learning. Records user moves of task blocks; after K=3
 * consistent-direction moves, surfaces a suggestion to update preferred_hour.
 * Default off — never auto-updates without user confirmation.
 */

export interface MoveRecord {
  taskId: string;
  originalHour: number;
  newHour: number;
}

export interface PreferenceSuggestion {
  taskId: string;
  suggestedHour: number;
  basedOnMoves: number;
}

const K = 3;

export function suggestPreferredHour(history: MoveRecord[]): PreferenceSuggestion[] {
  const byTask = new Map<string, MoveRecord[]>();
  for (const m of history) {
    const arr = byTask.get(m.taskId) ?? [];
    arr.push(m);
    byTask.set(m.taskId, arr);
  }
  const out: PreferenceSuggestion[] = [];
  for (const [taskId, moves] of byTask) {
    if (moves.length < K) continue;
    const recent = moves.slice(-K);
    // Consistent direction: all moves shifted the hour the same way relative to original.
    const directions = recent.map((m) => Math.sign(m.newHour - m.originalHour));
    const allSame = directions.every((d) => d !== 0 && d === directions[0]);
    if (!allSame) continue;
    const avg = recent.reduce((s, m) => s + m.newHour, 0) / recent.length;
    out.push({ taskId, suggestedHour: Math.round(avg), basedOnMoves: recent.length });
  }
  return out;
}

export function recordMove(history: MoveRecord[], move: MoveRecord): MoveRecord[] {
  return [...history, move];
}
