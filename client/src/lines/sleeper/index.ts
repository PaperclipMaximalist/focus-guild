/**
 * The Timber Line: a log-cabin sleeper rolling through birch country at dusk.
 * Colours and corners are in tokens.css, the frame in frame.css, the cabin
 * corner in scene.ts, the boards and the bench in texture.ts, the fairy lights
 * in wall.ts and the log wall behind it all in backdrop.ts.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import textures from './texture';
import wall from './wall';
import backdrop from './backdrop';
import ornaments from './ornaments';
import type { Line } from '../types';

const line: Line = {
  id: 'sleeper',
  name: 'Timber Line',
  journey: 'A log-cabin sleeper rolling through birch country at dusk, fairy lights up and something hot on the table.',
  windowHint: 'The train stops at a lamp-lit halt while a block is boarding and pulls out when you finish a quest.',
  swatch: ['#150D08', '#2E1E12', '#F2C14E'],
  order: 3,
  scene,
  textures,
  wall,
  backdrop,
  ornaments,
};

export default line;
