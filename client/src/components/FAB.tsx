import { Plus } from 'lucide-react';
interface Props {
  onClick: () => void;
}

export function FAB({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Add Quest"
      className="fixed bottom-20 right-4 z-[150] flex h-14 w-14 cursor-pointer items-center justify-center rounded-lg border-0 text-(--color-on-primary) transition-transform duration-150 active:scale-95 sm:bottom-7 sm:right-7"
      aria-label="Add quest"
      style={{ background: 'var(--color-primary)' }}
    >
      <Plus size={26} strokeWidth={2.5} aria-hidden />
    </button>
  );
}
