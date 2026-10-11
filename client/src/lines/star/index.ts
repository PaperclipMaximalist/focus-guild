/**
 * The Star Guild: a spacefaring guild's lounge on an orbital station, looking
 * out on a violet nebula. Taken from one reference still (the orbital lounge).
 * Colours, corners and the display face are in tokens.css; the rose-to-peach
 * sheen, capsule buttons and glow in frame.css; the viewport and console in
 * scene.ts; moulded plates and the bulkhead in texture.ts; the flag in
 * wall.ts; the nebula behind the app in backdrop.ts; and the trim (rims, light
 * channels, chevrons, the mission patch) in ornaments.ts.
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
  id: 'star',
  name: 'Star Guild',
  journey: 'A guild lounge on an orbital station in a violet nebula: moulded panels, mission patches, the guild flag flying outside the glass.',
  windowHint: 'A guild shuttle holds station outside the glass while a block is boarding and burns away when you finish a quest.',
  swatch: ['#0A0820', '#1C1850', '#FF85B8'],
  order: 6,
  finish: 'painted',
  scene,
  textures,
  wall,
  backdrop,
  ornaments,
};

export default line;
