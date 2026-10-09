/**
 * The Abyssal Line: a slow dive along a reef wall, with a whale for company.
 * Colours, frame and scene are in this folder; nothing else changes.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import type { Line } from '../types';

const line: Line = {
  id: 'deep',
  name: 'Abyssal Line',
  journey: 'A slow dive along the reef wall, where a whale keeps pace while you work.',
  windowHint: 'A whale swims alongside while a block is boarding and dives away when you finish a quest.',
  swatch: ['#061014', '#0C1A20', '#C8F560'],
  order: 2,
  scene,
};

export default line;
