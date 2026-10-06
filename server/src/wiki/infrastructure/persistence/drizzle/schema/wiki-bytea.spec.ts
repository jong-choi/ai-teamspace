import { wikiBytea } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-bytea';

import { pgTable } from 'drizzle-orm/pg-core';

const wikiByteaTestTable = pgTable('wiki_bytea_test', {
  value: wikiBytea('value').notNull(),
});

describe('위키 BYTEA custom type', () => {
  it('Uint8Array를 PostgreSQL Buffer로 변환하고 다시 복원한다', () => {
    const source = new Uint8Array([0, 1, 127, 255]);
    const driverValue = wikiByteaTestTable.value.mapToDriverValue(source);

    if (!Buffer.isBuffer(driverValue)) {
      throw new Error('BYTEA driver 값이 Buffer가 아닙니다.');
    }
    expect([...driverValue]).toEqual([...source]);
    expect(
      wikiByteaTestTable.value.mapFromDriverValue(Buffer.from(source)),
    ).toEqual(source);
  });
});
