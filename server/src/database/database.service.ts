import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { databaseSchema } from '@/database/schema';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

type DatabaseTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  readonly db;
  private readonly transactionScope = new AsyncLocalStorage<{
    transaction: DatabaseTransaction;
    active: boolean;
  }>();

  constructor(configService: ConfigService<AllConfigType>) {
    const url = configService.getOrThrow('database.url', { infer: true });
    this.pool = new Pool({ connectionString: url });
    this.db = drizzle(this.pool, { schema: databaseSchema });
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }

  async runInTransaction<T>(operation: () => Promise<T>): Promise<T> {
    if (this.transactionScope.getStore()) {
      throw new Error('공개 capability 트랜잭션은 중첩할 수 없습니다.');
    }
    return this.db.transaction((transaction) => {
      const scope = { transaction, active: true };
      return this.transactionScope.run(scope, async () => {
        try {
          return await operation();
        } finally {
          scope.active = false;
        }
      });
    });
  }

  // 소유 adapter끼리 동일 연결의 잠금을 공유하며 service에는 DB 객체를 노출하지 않는다.
  requireTransaction(): DatabaseTransaction {
    const scope = this.transactionScope.getStore();
    if (!scope?.active) {
      throw new Error(
        '이 capability는 활성 저장 트랜잭션 안에서만 호출할 수 있습니다.',
      );
    }
    return scope.transaction;
  }
}
