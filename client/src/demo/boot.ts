/**
 * The first import of main.tsx. ES imports run in order, depth first, so this
 * body runs before any other app module is evaluated: in the demo build the
 * clock, the sample data and the first-run switches are in place before the
 * app reads any of them.
 *
 * The condition is static: in every other build it is false at build time and
 * the demo code is left out (see the greps in the demo build's notes).
 */

import { installDemo } from './install';

if (import.meta.env.VITE_DEMO === '1') installDemo();
