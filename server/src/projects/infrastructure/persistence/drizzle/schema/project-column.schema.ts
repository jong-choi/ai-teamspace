import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const projectColumn = pgTable(
  'project_column',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    // 컬럼 이름 변경과 완료 통계의 의미를 분리하기 위한 내부 상태다.
    isCompleted: boolean('is_completed').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('project_column_id_project_unique').on(table.id, table.projectId),
    index('project_column_project_position_idx').on(
      table.projectId,
      table.position,
      table.id,
    ),
    check(
      'project_column_position_nonnegative_check',
      sql`${table.position} >= 0`,
    ),
  ],
);
