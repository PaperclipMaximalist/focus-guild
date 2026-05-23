export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatDeadline(deadline: string | Date | null): string {
  if (!deadline) return 'no deadline';
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 7) return `due in ${days}d`;
  return d.toLocaleDateString();
}

export function mentalLoadEmoji(load: number): string {
  // 1 → 😴, 5 → 😐, 10 → 🤯
  if (load <= 2) return '😴';
  if (load <= 4) return '🙂';
  if (load <= 6) return '😐';
  if (load <= 8) return '😬';
  return '🤯';
}
