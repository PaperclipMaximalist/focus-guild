import './env.js';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { startCalendarSyncLoop } from './lib/calendar/sync.js';

// The app itself is built in app.ts. env.js stays the first import here, so
// the .env files are read before any module looks at process.env.

startCalendarSyncLoop();

const port = Number(process.env['PORT']) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`Focus Guild API running on http://localhost:${port}`);
});

export default app;
