import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

import { user } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';

describe('데이터베이스 수명 통합', () => {
  it('한 앱을 종료한 뒤에도 다른 앱과 새 앱에서 쿼리할 수 있다', async () => {
    const first = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig],
        }),
        DatabaseModule,
      ],
    }).compile();
    const second = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig],
        }),
        DatabaseModule,
      ],
    }).compile();
    let firstClosed = false;

    try {
      await first.init();
      await second.init();
      await first.get(DatabaseService).db.select().from(user).limit(1);
      await second.get(DatabaseService).db.select().from(user).limit(1);
      await first.close();
      firstClosed = true;

      await expect(
        second.get(DatabaseService).db.select().from(user).limit(1),
      ).resolves.toEqual(expect.any(Array));

      const restarted = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [databaseConfig],
          }),
          DatabaseModule,
        ],
      }).compile();
      try {
        await restarted.init();
        await expect(
          restarted.get(DatabaseService).db.select().from(user).limit(1),
        ).resolves.toEqual(expect.any(Array));
      } finally {
        await restarted.close();
      }
    } finally {
      if (!firstClosed) await first.close();
      await second.close();
    }
  });
});
