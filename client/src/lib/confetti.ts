const CONFETTI_COLORS = ['#F2B33D', '#3987E5', '#199E70', '#D55181', '#D95926', '#E8E3D8'];

/** Spawns a burst of confetti pieces from the top of the viewport. */
export function spawnConfetti(count = 60) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = `${Math.random() * 100}vw`;
    el.style.top = '-10px';
    el.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!;
    const size = Math.random() * 8 + 4;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.animationDuration = `${Math.random() * 2 + 2}s`;
    el.style.animationDelay = `${Math.random() * 0.8}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}
