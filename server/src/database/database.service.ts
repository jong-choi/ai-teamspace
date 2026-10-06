import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { parseDatabaseEnvironment } from '@/config/runtime-environment';
import { databaseSchema } from '@/database/schema';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  readonly db;

  constructor() {
    const { DATABASE_URL } = parseDatabaseEnvironment();
    this.pool = new Pool({ connectionString: DATABASE_URL });
    this.db = drizzle(this.pool, { schema: databaseSchema });
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
