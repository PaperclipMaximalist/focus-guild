import { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { PriorityTier } from '../lib/api';

const TIERS: Array<{ value: PriorityTier; label: string; color: string; sub: string }> = [
  { value: 'LOW', label: 'Low',  color: '#64748b', sub: 'If time' },
  { value: 'MED', label: 'Med',  color: '#8b5cf6', sub: 'Default' },
  { value: 'HIGH', label: 'High', color: '#ef4444', sub: 'Must do' },
];

interface Props {
  value: PriorityTier;
  onChange: (v: PriorityTier) => void;
}

/**
 * 3-stop horizontal dragger. Tap any stop to select; or click+drag the
 * thumb to slide between them. The track lights up in the tier's color.
 */
export function PriorityDragger({ value, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const idx = Math.max(0, TIERS.findIndex((t) => t.value === value));
  const active = TIERS[idx] ?? TIERS[1]!;

  const pickFromX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      const stop = Math.round(ratio * (TIERS.length - 1));
      const next = TIERS[stop]!.value;
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        className="relative h-12 rounded-full border touch-none"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderColor: 'var(--color-border)',
        }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          draggingRef.current = true;
          pickFromX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          pickFromX(e.clientX);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        {/* Three labeled stops */}
        {TIERS.map((t, i) => {
          const leftPct = (i / (TIERS.length - 1)) * 100;
          const isActive = t.value === value;
          return (
            <div
              key={t.value}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-center pointer-events-none"
              style={{ left: `${leftPct}%` }}
            >
              <div
                className="text-[0.7rem] font-bold tracking-wide"
                style={{ color: isActive ? t.color : 'var(--color-muted)' }}
              >
                {t.label}
              </div>
              <div className="text-[0.55rem]" style={{ color: 'var(--color-muted)' }}>
                {t.sub}
              </div>
            </div>
          );
        })}

        {/* Thumb */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-14 h-14 rounded-full pointer-events-none"
          animate={{ left: `${(idx / (TIERS.length - 1)) * 100}%` }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            background: `${active.color}1f`,
            border: `2px solid ${active.color}`,
            boxShadow: `0 0 14px ${active.color}44`,
          }}
        />
      </div>
    </div>
  );
}
