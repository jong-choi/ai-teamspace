import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import type {
  SemanticCorrectionAnchor,
  SemanticCorrectionValue,
} from '@/knowledge-graph/domain/semantic-correction-anchor';
import { SemanticSourceScopeSchema } from '@/outbox/domain/semantic-source';

import { inArray, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const correctionTargetKinds = ['entity', 'relation'] as const;
const correctionActions = [
  'label_override',
  'suppress',
  'asserted_relation',
] as const;
const correctionStatuses = ['active', 'cancelled'] as const;
const correctionMatchStates = [
  'matched',
  'pending_review',
  'ambiguous_review',
] as const;
const [firstSourceKind, ...remainingSourceKinds] =
  SemanticSourceScopeSchema.shape.aggregateKind.options;
if (!firstSourceKind) throw new Error('의미 원본 종류가 비어 있습니다.');
const sourceKinds = [firstSourceKind, ...remainingSourceKinds] satisfies [
  typeof firstSourceKind,
  ...typeof remainingSourceKinds,
];
const at = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3 });

export const semanticCorrectionSource = pgTable(
  'kg_semantic_correction_source',
  {
    organizationId: text('organization_id').notNull(),
    sourceKind: text('source_kind', { enum: sourceKinds }).notNull(),
    sourceId: text('source_id').notNull(),
    editRevision: bigint('edit_revision', { mode: 'number' })
      .default(0)
      .notNull(),
    updatedAt: at('updated_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.sourceKind, t.sourceId] }),
    check(
      'kg_semantic_correction_source_kind_check',
      inArray(t.sourceKind, sourceKinds).inlineParams(),
    ),
    check(
      'kg_semantic_correction_source_revision_check',
      sql`${t.editRevision} >= 0 and ${t.editRevision} <= ${Number.MAX_SAFE_INTEGER}`.inlineParams(),
    ),
  ],
);

export const semanticCorrection = pgTable(
  'kg_semantic_correction',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id').notNull(),
    sourceKind: text('source_kind', { enum: sourceKinds }).notNull(),
    sourceId: text('source_id').notNull(),
    correctionTargetId: text('correction_target_id').notNull(),
    targetKind: text('target_kind', { enum: correctionTargetKinds }).notNull(),
    action: text('action', { enum: correctionActions }).notNull(),
    anchor: jsonb('anchor').$type<SemanticCorrectionAnchor>().notNull(),
    value: jsonb('value').$type<SemanticCorrectionValue>(),
    linkedCorrectionId: uuid('linked_correction_id'),
    status: text('status', { enum: correctionStatuses })
      .default('active')
      .notNull(),
    createdRevision: bigint('created_revision', { mode: 'number' }).notNull(),
    cancelledRevision: bigint('cancelled_revision', { mode: 'number' }),
    createdByUserId: text('created_by_user_id').references(
      () => authUserIdColumn,
      { onDelete: 'set null' },
    ),
    cancelledByUserId: text('cancelled_by_user_id').references(
      () => authUserIdColumn,
      { onDelete: 'set null' },
    ),
    createdAt: at('created_at').defaultNow().notNull(),
    cancelledAt: at('cancelled_at'),
    lastMatchState: text('last_match_state', { enum: correctionMatchStates }),
    lastMatchedGenerationId: uuid('last_matched_generation_id'),
    lastMatchedAt: at('last_matched_at'),
  },
  (t) => [
    unique('kg_semantic_correction_id_source_unique').on(
      t.id,
      t.organizationId,
      t.sourceKind,
      t.sourceId,
    ),
    foreignKey({
      name: 'kg_semantic_correction_source_fk',
      columns: [t.organizationId, t.sourceKind, t.sourceId],
      foreignColumns: [
        semanticCorrectionSource.organizationId,
        semanticCorrectionSource.sourceKind,
        semanticCorrectionSource.sourceId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'kg_semantic_correction_link_fk',
      columns: [
        t.linkedCorrectionId,
        t.organizationId,
        t.sourceKind,
        t.sourceId,
      ],
      foreignColumns: [t.id, t.organizationId, t.sourceKind, t.sourceId],
    }).onDelete('restrict'),
    index('kg_semantic_correction_source_idx').on(
      t.organizationId,
      t.sourceKind,
      t.sourceId,
      t.status,
    ),
    check(
      'kg_semantic_correction_target_check',
      inArray(t.targetKind, [...correctionTargetKinds]).inlineParams(),
    ),
    check(
      'kg_semantic_correction_action_check',
      inArray(t.action, [...correctionActions]).inlineParams(),
    ),
    check(
      'kg_semantic_correction_status_check',
      inArray(t.status, [...correctionStatuses]).inlineParams(),
    ),
    check(
      'kg_semantic_correction_match_check',
      sql`${t.lastMatchState} is null or ${inArray(t.lastMatchState, [...correctionMatchStates]).inlineParams()}`,
    ),
    check(
      'kg_semantic_correction_cancel_check',
      sql`(${t.status} = 'cancelled') = (${t.cancelledRevision} is not null) and (${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`,
    ),
    check(
      'kg_semantic_correction_value_check',
      sql`(${t.value} is not null) = (${t.action} in ('label_override', 'asserted_relation')) and (${t.action} <> 'asserted_relation' or ${t.targetKind} = 'relation')`,
    ),
    check(
      'kg_semantic_correction_revision_check',
      sql`${t.createdRevision} > 0 and ${t.createdRevision} <= ${Number.MAX_SAFE_INTEGER} and (${t.cancelledRevision} is null or (${t.cancelledRevision} > ${t.createdRevision} and ${t.cancelledRevision} <= ${Number.MAX_SAFE_INTEGER}))`.inlineParams(),
    ),
    check(
      'kg_semantic_correction_target_id_check',
      sql`${t.correctionTargetId} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
