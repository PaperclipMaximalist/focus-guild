/**
 * The Salvage Line: a riveted copper dispatch cockpit over a scrapyard in the dust, with a green screen ticking off the day's parcels.
 * Colours and corners are in tokens.css, the frame in frame.css, the pictures in scene.ts, charm.ts and backdrop.ts.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import charm from './charm';
import backdrop from './backdrop';
import type { Line } from '../types';

const line: Line = {
  id: 'dispatch',
  name: 'Salvage Line',
  journey: 'A copper dispatch cockpit over a scrapyard in the dust, with a green screen ticking off the day\'s parcels.',
  windowHint: 'A courier skiff docks while a block is boarding and lifts off when you finish a quest.',
  swatch: ['#0F0D0A', '#191511', '#7CB7FF'],
  order: 4,
  scene,
  charm,
  backdrop,
};

export default line;
