import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { parseDatabaseEnvironment } from '#server/config/runtime-environment.js';
import * as schema from '#server/database/schema.js';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  readonly db;

  constructor() {
    const { DATABASE_URL } = parseDatabaseEnvironment();
    this.pool = new Pool({ connectionString: DATABASE_URL });
    this.db = drizzle(this.pool, { schema });
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
