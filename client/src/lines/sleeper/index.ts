/**
 * The Timber Line: a night sleeper through birch country, stopping at lamp-lit halts.
 * Colours and corners are in tokens.css, the frame in frame.css, the view in scene.ts.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import type { Line } from '../types';

const line: Line = {
  id: 'sleeper',
  name: 'Timber Line',
  journey: 'A night sleeper through birch country, stopping at lamp-lit halts.',
  windowHint: 'The train stops at a lamp-lit halt while a block is boarding and pulls out when you finish a quest.',
  swatch: ['#0F0B09', '#18120F', '#F2C14E'],
  order: 3,
  scene,
};

export default line;
