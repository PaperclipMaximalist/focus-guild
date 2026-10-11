/**
 * The Spire Guild: a fantasy guild hall aboard an airship, moored over a
 * cathedral city in green mist. Taken from one reference still (the emerald
 * cathedral city). Colours, corners and the display face are in tokens.css; the
 * gold plates and lettering in frame.css; the deck and the city in scene.ts;
 * chest-lid iron and banner damask in texture.ts; the hanging banner in
 * wall.ts; the city behind the app in backdrop.ts; and the fittings (brackets,
 * rope, pennants, the guild's arms) in ornaments.ts.
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
  id: 'spire',
  name: 'Spire Guild',
  journey: 'A guild airship moored over a cathedral city in green mist: banners on iron poles, amber windows, gold on black iron.',
  windowHint: 'Another guild ship moors beside the tower while a block is boarding and casts off when you finish a quest.',
  swatch: ['#07110E', '#11261F', '#F5B63C'],
  order: 5,
  finish: 'painted',
  scene,
  textures,
  wall,
  backdrop,
  ornaments,
};

export default line;
