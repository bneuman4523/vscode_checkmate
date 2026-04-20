import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Use Neon WebSocket driver only for Neon cloud URLs, standard pg for everything else
const isNeonDb = process.env.DATABASE_URL.includes('neon.tech') || process.env.DATABASE_URL.includes('neon.cloud');

let pool: any;
let db: any;

if (!isNeonDb) {
  // Standard Postgres — works for local, Docker, AWS RDS, Aurora, etc.
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  pool = new pg.default.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 7,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', (err: Error) => {
    console.error('PG Pool error', err);
  });
  db = drizzle({ client: pool, schema });
} else {
  // Neon cloud Postgres — use WebSocket driver
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = await import('ws');
  neonConfig.webSocketConstructor = ws.default;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 7,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', (err: Error) => {
    console.error('PG Pool error', err);
  });
  db = drizzle({ client: pool, schema });
}

export { pool, db };
