interface Props {
  onClick: () => void;
}

export function FAB({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Add Quest"
      className="fixed bottom-7 right-7 z-[150] flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-0 text-2xl text-white shadow-[0_4px_20px_rgba(139,92,246,0.5)] transition-all duration-200 hover:rotate-45 hover:scale-110 hover:shadow-[0_6px_28px_rgba(139,92,246,0.7)]"
      style={{ background: 'linear-gradient(135deg, #8b5cf6, #c084fc)' }}
    >
      +
    </button>
  );
}
