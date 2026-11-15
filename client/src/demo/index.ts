/**
 * The demo build (`npm run build:demo`, VITE_DEMO=1 in .env.ios-demo): the app
 * with sample data, signed in, no network, steered by /demo-route.json. Used
 * on CI to photograph every screen in every line on the iPhone simulator.
 *
 * main.tsx only calls these inside `if (import.meta.env.VITE_DEMO === '1')`.
 */

export { startDemoAuth } from './auth';
export { startDemoDriver } from './driver';
