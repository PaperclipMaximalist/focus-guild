/**
 * The Ring Line: a worn, cosy compartment on a slow train through space, with a crystal for company.
 * Colours and corners are in tokens.css, the frame in frame.css, the pictures in scene.ts, charm.ts and backdrop.ts.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import charm from './charm';
import backdrop from './backdrop';
import type { Line } from '../types';

const line: Line = {
  id: 'orbital',
  name: 'Ring Line',
  journey: 'A worn, cosy compartment on a slow train through space, with a crystal for company.',
  windowHint: 'A shuttle draws alongside while a block is boarding and peels away when you finish a quest.',
  swatch: ['#0D0A17', '#171226', '#FF6FB1'],
  order: 1,
  scene,
  charm,
  backdrop,
};

export default line;
