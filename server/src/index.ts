import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { users } from './routes/users.js';
import { quests } from './routes/quests.js';
import { checkin } from './routes/checkin.js';
import { schedule } from './routes/schedule.js';
import { requireUser } from './lib/auth.js';

const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env['VITE_API_URL'] ?? 'http://localhost:5173',
    allowHeaders: ['Content-Type', 'Authorization', 'X-Dev-Clerk-Id'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

// Resolves the user (or 401s) for everything except /health and POST /users.
app.use('*', requireUser);

app.route('/users', users);
app.route('/quests', quests);
app.route('/checkin', checkin);
app.route('/schedule', schedule);

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
