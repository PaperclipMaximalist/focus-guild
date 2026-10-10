/**
 * The Night Line: the default. Its colours are the app's own (@theme in
 * index.css), so it has no tokens.css; frame.css only adds enamel-sign
 * screws, a tiled sidebar wall and studs to what index.css already does.
 * The waiting room is in scene.ts, the line map in charm.ts and the rain
 * against the building in backdrop.ts.
 */

import './frame.css';
import scene from './scene';
import charm from './charm';
import backdrop from './backdrop';
import type { Line } from '../types';

const line: Line = {
  id: 'night',
  name: 'Night Line',
  journey: 'A waiting room on a maglev platform in the rain, at the blue hour, somewhere that isn\'t here.',
  windowHint: 'A train waits while a block is boarding and leaves when you finish a quest.',
  swatch: ['#06081A', '#0C1027', '#FFD23A'],
  order: 0,
  scene,
  charm,
  backdrop,
};

export default line;
