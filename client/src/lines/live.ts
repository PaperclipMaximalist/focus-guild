/**
 * The one fact the line canvases need that no store holds: how many quests
 * are past their deadline. Today and the sidebar each fetch it for their own
 * use and report it here.
 */

let overdue = 0;

export function reportOverdue(n: number): void {
  overdue = n;
}

export function overdueCount(): number {
  return overdue;
}
