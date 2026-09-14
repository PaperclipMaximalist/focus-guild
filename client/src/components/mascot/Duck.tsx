/**
 * The rubber duck, drawn in SVG.
 *
 * Deliberately goofy: two mismatched googly eyes whose pupils sit on loose
 * springs, so every reaction leaves them wobbling; a hop and a wing flap
 * when something good happens; an idle bob like it's floating in a sink.
 *
 * Moods only add small props (a sweat drop, a "z", sparks) — the duck's face
 * never frowns. It is on your side even when things are overdue.
 *
 * All motion is skipped under prefers-reduced-motion; the duck still changes
 * mood, it just doesn't bounce.
 */

import { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion, useSpring } from 'framer-motion';
import type { MascotMood } from '../../lib/mascotLines';

interface Props {
  mood: MascotMood;
  /** Changes on every reaction; each change replays the hop and the wobble. */
  beat: number;
  size?: number;
}

const INK = '#2A1E12';
const BODY = '#F4C02E';
const WING = '#E0A417';
const BEAK = '#F07C2C';
const EYE = '#FFFDF6';

export function Duck({ mood, beat, size = 56 }: Props) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');

  // Googly pupils: low damping, so a nudge rings on for a moment.
  const px = useSpring(0, { stiffness: 260, damping: 4, mass: 0.5 });
  const py = useSpring(0, { stiffness: 260, damping: 4, mass: 0.5 });

  useEffect(() => {
    if (reduce || beat === 0) return;
    px.set((Math.random() - 0.5) * 5);
    py.set((Math.random() - 0.5) * 4);
    const t = setTimeout(() => {
      px.set(0);
      py.set(mood === 'sleepy' ? 1.2 : 0);
    }, 70);
    return () => clearTimeout(t);
  }, [beat, reduce, px, py, mood]);

  // Blink at human-ish random intervals.
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (reduce) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => alive && setBlink(false), 130);
        schedule();
      }, 2600 + Math.random() * 3600);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [reduce]);

  const lid = blink ? 1 : mood === 'sleepy' ? 0.55 : 0;
  const excited = mood === 'party' || mood === 'happy';

  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={`le-${uid}`}><circle cx="37" cy="20" r="6.4" /></clipPath>
        <clipPath id={`re-${uid}`}><circle cx="49.5" cy="17.5" r="5.4" /></clipPath>
      </defs>

      {/* Ripple under the duck — it's floating. */}
      <ellipse cx="36" cy="65" rx="22" ry="2.6" fill="#000" opacity="0.28" />

      <motion.g
        key={reduce ? 'still' : `hop-${beat}`}
        style={{ transformOrigin: '36px 60px' }}
        initial={false}
        animate={
          reduce
            ? { y: 0 }
            : beat > 0 && excited
              ? { y: [0, -11, 0, -4, 0], scaleY: [1, 1.04, 0.92, 1.02, 1] }
              : { y: [0, -1.6, 0], rotate: [-1.5, 1.5, -1.5] }
        }
        transition={
          beat > 0 && excited
            ? { duration: 0.65, ease: 'easeOut' }
            : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        {/* Tail */}
        <path d="M13 45 L4 33 L17 38 Z" fill={BODY} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
        {/* Body */}
        <path
          d="M10 47 C10 35 22 32 34 34 C44 35.5 52 38.5 58 36.5 C64.5 34.5 66.5 42 63.5 49 C59.5 58 48 62.5 34 62.5 C20 62.5 10 57 10 47 Z"
          fill={BODY}
          stroke={INK}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* Wing — flaps when celebrating */}
        <motion.path
          d="M21 47 C25 39.5 37.5 40 40 47.5 C34.5 53 25.5 53 21 47 Z"
          fill={WING}
          stroke={INK}
          strokeWidth="2"
          strokeLinejoin="round"
          style={{ transformOrigin: '38px 47px' }}
          key={reduce ? 'wing' : `wing-${beat}`}
          initial={false}
          animate={!reduce && beat > 0 && mood === 'party' ? { rotate: [0, -38, 0, -26, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6 }}
        />
        {/* Head */}
        <circle cx="42" cy="22" r="15" fill={BODY} stroke={INK} strokeWidth="2.2" />
        {/* Hair tuft */}
        <path d="M39 7.5 C40 2.5 46 2.5 45 7.5" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        {/* Beak: a big goofy one */}
        <path
          d="M53 25 C60 21.5 69.5 23 69.5 27.5 C69.5 32 61 34 53 31 Z"
          fill={BEAK}
          stroke={INK}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M55 28.5 C60 29.5 64 29.2 68 28" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
        {/* Blush */}
        <ellipse cx="47.5" cy="30.5" rx="3" ry="1.7" fill="#F28B6B" opacity="0.55" />

        {/* Googly eyes, mismatched on purpose */}
        <circle cx="37" cy="20" r="6.4" fill={EYE} stroke={INK} strokeWidth="2" />
        <circle cx="49.5" cy="17.5" r="5.4" fill={EYE} stroke={INK} strokeWidth="2" />
        <g clipPath={`url(#le-${uid})`}>
          <motion.circle cx="37.5" cy="21" r="2.9" fill={INK} style={{ x: px, y: py }} />
          <motion.rect
            x="29" y="12" width="16" height="14" fill={BODY}
            style={{ transformOrigin: '37px 12px' }}
            animate={{ scaleY: lid }}
            initial={false}
            transition={{ duration: 0.09 }}
          />
        </g>
        <g clipPath={`url(#re-${uid})`}>
          <motion.circle cx="50" cy="18.5" r="2.5" fill={INK} style={{ x: px, y: py }} />
          <motion.rect
            x="43" y="10.5" width="14" height="12.5" fill={BODY}
            style={{ transformOrigin: '50px 10.5px' }}
            animate={{ scaleY: lid }}
            initial={false}
            transition={{ duration: 0.09 }}
          />
        </g>

        {/* Mood props */}
        {mood === 'sweat' && (
          <path d="M24.5 9 C22 13.5 22 16.5 24.5 16.5 C27 16.5 27 13.5 24.5 9 Z" fill="#7FC0EA" stroke={INK} strokeWidth="1.4" />
        )}
        {mood === 'sleepy' && (
          <text x="58" y="8" fontSize="10" fontWeight="700" fontFamily="ui-monospace, monospace" fill={INK} stroke="#FFFDF6" strokeWidth="0.6" paintOrder="stroke">
            z
          </text>
        )}
        {mood === 'party' && (
          <g stroke={BODY} strokeWidth="2.2" strokeLinecap="round">
            <path d="M28 4 L25 -1" />
            <path d="M58 5 L62 0" />
            <path d="M65 14 L71 12" />
          </g>
        )}
      </motion.g>
    </svg>
  );
}
