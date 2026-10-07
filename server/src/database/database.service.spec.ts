import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';

import { jest } from '@jest/globals';

describe('데이터베이스 수명 관리', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('앱마다 독립적인 Pool을 소유하고 해당 앱을 닫을 때만 종료한다', async () => {
    const first = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: () =>
          'postgresql://postgres:postgres@localhost:5432/lifecycle_test',
      })
      .compile();
    const second = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: () =>
          'postgresql://postgres:postgres@localhost:5432/lifecycle_test',
      })
      .compile();
    const firstPool = first.get(DatabaseService).db.$client;
    const secondPool = second.get(DatabaseService).db.$client;
    const firstEnd = jest.spyOn(firstPool, 'end');
    const secondEnd = jest.spyOn(secondPool, 'end');

    try {
      expect(first.get(DatabaseService)).toBe(first.get(DatabaseService));
      expect(firstPool).not.toBe(secondPool);
      await first.close();
      expect(firstEnd).toHaveBeenCalledTimes(1);
      expect(secondEnd).not.toHaveBeenCalled();
    } finally {
      if (firstEnd.mock.calls.length === 0) await first.close();
      await second.close();
    }
    expect(secondEnd).toHaveBeenCalledTimes(1);
  });

  it('서비스를 대체하면 실제 DB 설정이나 Pool 생성 없이 모듈을 구성한다', async () => {
    const replacement = { db: {} };
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(replacement)
      .compile();

    try {
      expect(moduleRef.get(DatabaseService)).toBe(replacement);
    } finally {
      await moduleRef.close();
    }
  });
});
