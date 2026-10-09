/**
 * The Ring Line: a slow orbit past a ringed giant, where shuttles dock at the spur.
 * Colours and corners are in tokens.css, the frame in frame.css, the view in scene.ts.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import type { Line } from '../types';

const line: Line = {
  id: 'orbital',
  name: 'Ring Line',
  journey: 'A slow orbit past a ringed giant, where shuttles dock at the spur.',
  windowHint: 'A shuttle docks while a block is boarding and casts off when you finish a quest.',
  swatch: ['#0A0814', '#131022', '#FF6FB1'],
  order: 1,
  scene,
};

export default line;
