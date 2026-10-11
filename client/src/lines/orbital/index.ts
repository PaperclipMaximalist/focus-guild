/**
 * The Ring Line: a worn, cosy compartment on a slow train through space, with a crystal for company.
 * Colours and corners are in tokens.css, the frame in frame.css, the pictures in scene.ts and backdrop.ts, the sprayed violet and the leaf print in texture.ts.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import textures from './texture';
import backdrop from './backdrop';
import ornaments from './ornaments';
import type { Line } from '../types';

const line: Line = {
  id: 'orbital',
  name: 'Ring Line',
  journey: 'A worn, cosy compartment on a slow train through space, with a crystal for company.',
  windowHint: 'A shuttle draws alongside while a block is boarding and peels away when you finish a quest.',
  swatch: ['#120B24', '#20163D', '#FF6FB1'],
  order: 1,
  scene,
  textures,
  backdrop,
  ornaments,
};

export default line;
