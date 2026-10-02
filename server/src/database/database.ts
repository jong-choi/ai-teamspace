import 'dotenv/config';

import * as schema from '#server/database/schema.js';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const poolOptions = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : undefined;

export const databasePool = new Pool(poolOptions);

export const database = drizzle(databasePool, {
  schema,
});
