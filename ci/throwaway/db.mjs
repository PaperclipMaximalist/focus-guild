// A throwaway Postgres: PGlite in memory, served on a TCP port on 127.0.0.1,
// with every migration in the given folder applied in order. Nothing is
// written to disk and nothing touches the real (Neon) database; stopping
// this process throws everything away.
//
//   node db.mjs <migrations dir> <port>
//
// PGlite answers one connection at a time, so the server's preload opens a
// pool of one (preload.mjs). Prints "pglite ready on 127.0.0.1:<port>" once
// it is listening.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = process.argv[2];
const port = Number(process.argv[3] ?? 54329);
if (!migrationsDir || !Number.isInteger(port) || port <= 0) {
  console.error('usage: node db.mjs <migrations dir> <port>');
  process.exit(2);
}

const db = await PGlite.create();
const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
if (dirs.length === 0) {
  console.error(`no migrations found in ${migrationsDir}`);
  process.exit(1);
}
for (const d of dirs) {
  const sql = readFileSync(join(migrationsDir, d, 'migration.sql'), 'utf8');
  await db.exec(sql);
  console.log('applied', d);
}

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`pglite ready on 127.0.0.1:${port}`);

// SIGTERM too: CI stops it by PID with a plain `kill`.
const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
