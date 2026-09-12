import dotenv from 'dotenv';

// .env holds real secrets (Neon DATABASE_URL, live Clerk key). .env.local is
// gitignored and optional — when present, its keys override .env, letting
// you flip individual values (e.g. blank out CLERK_SECRET_KEY) for local-only
// testing without touching the real .env file.
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
