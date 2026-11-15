// Loaded before the server (tsx --import): hands it a Prisma client on the
// throwaway PGlite (through the pg adapter), so server/src/db/client.ts finds
// globalThis.prisma and never builds its Neon client.
//
// Run from server/ (it loads server/generated/prisma/client.ts from the
// current folder) with LOCAL_PG_URL set. Refuses to start without it, so a
// missing variable can never fall through to a real database.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const url = process.env.LOCAL_PG_URL;
if (!url || !/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):\d+\//.test(url)) {
  console.error('[preload] LOCAL_PG_URL must point at the throwaway database on 127.0.0.1; refusing to start.');
  process.exit(2);
}

// The adapter and pg come from this folder's node_modules, not the server's.
const req = createRequire(new URL('.', import.meta.url));
const { PrismaPg } = req('@prisma/adapter-pg');
const pg = req('pg');

const serverDir = process.cwd();
const { PrismaClient } = await import(pathToFileURL(join(serverDir, 'generated/prisma/client.ts')).href);

// One connection: PGlite serves one at a time.
const pool = new pg.Pool({ connectionString: url, max: 1 });
globalThis.prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
console.log('[preload] Prisma is on the throwaway database at', url);
