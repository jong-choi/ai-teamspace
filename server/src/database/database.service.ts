import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { database, databasePool } from '#server/database/database.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly db = database;

  async onApplicationShutdown() {
    await databasePool.end();
  }
}
