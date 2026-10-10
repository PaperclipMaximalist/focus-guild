/**
 * The Salvage Line: a dispatch cabin over a breaker's yard, where a courier skiff docks.
 * Colours and corners are in tokens.css, the frame in frame.css, the view in scene.ts.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import type { Line } from '../types';

const line: Line = {
  id: 'dispatch',
  name: 'Salvage Line',
  journey: "A dispatch cabin over the breaker's yard, where a courier skiff docks while you work.",
  windowHint: 'A courier skiff docks while a block is boarding and lifts off when you finish a quest.',
  swatch: ['#0F0D0A', '#191511', '#7CB7FF'],
  order: 4,
  scene,
};

export default line;
