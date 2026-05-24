import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { users } from './routes/users.js';
import { quests } from './routes/quests.js';
import { checkin } from './routes/checkin.js';
import { schedule } from './routes/schedule.js';
import { settings } from './routes/settings.js';
import { requireUser } from './lib/auth.js';

const app = new Hono();

app.use('*', logger());

// Allowed CORS origins. Set CLIENT_URL to a comma-separated list of
// origins in production (e.g. "https://focus-guild.vercel.app,https://www.example.com").
// Dev fallback always permits Vite at :5173.
const clientUrls = (process.env['CLIENT_URL'] ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow no-Origin requests (curl, health checks) through.
      if (!origin) return origin;
      return clientUrls.includes(origin) ? origin : null;
    },
    allowHeaders: ['Content-Type', 'Authorization', 'X-Dev-Clerk-Id'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

// Resolves the user (or 401s) for everything except /health and POST /users.
app.use('*', requireUser);

app.route('/users', users);
app.route('/quests', quests);
app.route('/checkin', checkin);
app.route('/schedule', schedule);
app.route('/settings', settings);

// 404 catch-all
app.notFound((c) =>
  c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404),
);

// Unhandled error handler
app.onError((err, c) => {
  console.error(err);
  return c.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    500,
  );
});

const port = Number(process.env['PORT']) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`Focus Guild API running on http://localhost:${port}`);
});

export default app;
