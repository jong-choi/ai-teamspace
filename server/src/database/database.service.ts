import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { databaseSchema } from '@/database/schema';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  readonly db;

  constructor(configService: ConfigService<AllConfigType>) {
    const url = configService.getOrThrow('database.url', { infer: true });
    this.pool = new Pool({ connectionString: url });
    this.db = drizzle(this.pool, { schema: databaseSchema });
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
