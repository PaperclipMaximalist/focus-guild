/**
 * The Abyssal Line: the bridge of an old brass submersible, deep in green water.
 * Colours, frame, scene, charm and backdrop are in this folder; nothing else changes.
 */

import './tokens.css';
import './frame.css';
import scene from './scene';
import charm from './charm';
import backdrop from './backdrop';
import type { Line } from '../types';

const line: Line = {
  id: 'deep',
  name: 'Abyssal Line',
  journey: 'The bridge of an old brass submersible, deep in green water, with a whale for company.',
  windowHint: 'A whale swims alongside while a block is boarding and dives away when you finish a quest.',
  swatch: ['#06110E', '#0C1B16', '#C8F560'],
  order: 2,
  scene,
  charm,
  backdrop,
};

export default line;
