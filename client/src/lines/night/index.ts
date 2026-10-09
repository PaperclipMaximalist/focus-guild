/**
 * The Night Line: the default. Its colours and frame are the app's own
 * (@theme and the shared classes in index.css), so it has no tokens.css or
 * frame.css; every other line is a set of differences from this one.
 */

import scene from './scene';
import type { Line } from '../types';

const line: Line = {
  id: 'night',
  name: 'Night Line',
  journey: 'A maglev stop in the rain, under a ringed moon.',
  windowHint: 'A train waits while a block is boarding and leaves when you finish a quest.',
  swatch: ['#06081A', '#0C1027', '#FFD23A'],
  order: 0,
  scene,
};

export default line;
