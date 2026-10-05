import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { project } from '#server/projects/infrastructure/persistence/drizzle/schema/project.schema.js';
import { projectColumn } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.schema.js';

import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'urgent',
  'high',
  'medium',
  'low',
]);

export const ticket = pgTable(
  'ticket',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id').notNull(),
    projectId: uuid('project_id').notNull(),
    columnId: uuid('column_id').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    descriptionMarkdown: text('description_markdown').default('').notNull(),
    priority: ticketPriorityEnum('priority').default('medium').notNull(),
    assigneeUserId: text('assignee_user_id').references(
      () => authUserIdColumn,
      {
        onDelete: 'set null',
      },
    ),
    reporterUserId: text('reporter_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    uniqueIndex('ticket_project_number_uidx').on(table.projectId, table.number),
    foreignKey({
      name: 'ticket_project_organization_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [project.id, project.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ticket_column_project_fk',
      columns: [table.columnId, table.projectId],
      foreignColumns: [projectColumn.id, projectColumn.projectId],
    }).onDelete('restrict'),
    index('ticket_project_column_position_idx').on(
      table.projectId,
      table.columnId,
      table.position,
      table.id,
    ),
    index('ticket_organization_project_archived_idx').on(
      table.organizationId,
      table.projectId,
      table.archivedAt,
    ),
    index('ticket_assignee_user_idx').on(table.assigneeUserId),
    check('ticket_number_positive_check', sql`${table.number} > 0`),
    check('ticket_position_nonnegative_check', sql`${table.position} >= 0`),
  ],
);
