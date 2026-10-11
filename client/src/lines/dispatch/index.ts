/**
 * The Salvage Line: a riveted copper dispatch cockpit over a scrapyard in the dust, with a green screen ticking off the day's parcels.
 * Colours and corners are in tokens.css, the frame in frame.css, the cockpit window in scene.ts, the brass plate
 * and the boiler in texture.ts, the lamps and steam in wall.ts and the hull behind it all in backdrop.ts.
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
  id: 'dispatch',
  name: 'Salvage Line',
  journey: 'A copper dispatch cockpit over a scrapyard in the dust, with a green screen ticking off the day\'s parcels.',
  windowHint: 'A courier skiff docks while a block is boarding and lifts off when you finish a quest.',
  swatch: ['#12100A', '#2A2614', '#7CB7FF'],
  order: 4,
  scene,
  textures,
  wall,
  backdrop,
  ornaments,
};

export default line;
