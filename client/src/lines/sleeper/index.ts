/**
 * The Timber Line: a log-cabin sleeper rolling through birch country at dusk.
 * Colours and corners are in tokens.css, the frame in frame.css, the cabin
 * corner in scene.ts, the shelf in charm.ts and the room's air in backdrop.ts.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import charm from './charm';
import backdrop from './backdrop';
import type { Line } from '../types';

const line: Line = {
  id: 'sleeper',
  name: 'Timber Line',
  journey: 'A log-cabin sleeper rolling through birch country at dusk, fairy lights up and something hot on the table.',
  windowHint: 'The train stops at a lamp-lit halt while a block is boarding and pulls out when you finish a quest.',
  swatch: ['#0F0B09', '#18120F', '#F2C14E'],
  order: 3,
  scene,
  charm,
  backdrop,
};

export default line;
