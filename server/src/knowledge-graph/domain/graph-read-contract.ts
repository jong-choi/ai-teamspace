import { z } from 'zod';

export const GraphNodeKindSchema = z.enum([
  'wiki_document',
  'project',
  'ticket',
  'meeting',
  'member',
  'curated_node',
  'semantic_entity',
]);
export const GraphOwnerKindSchema = GraphNodeKindSchema.exclude([
  'curated_node',
  'semantic_entity',
]);
export const GraphEdgeRelationSchema = z.enum([
  'wiki_parent',
  'ticket_project',
  'ticket_assignee',
  'ticket_reporter',
  'project_lead',
  'project_creator',
  'meeting_organizer',
  'meeting_attendee',
  'curated',
  'mentions',
  'semantic',
  'asserted',
]);
export const GraphFactClassSchema = z.enum([
  'authoritative',
  'extracted',
  'user_curated',
]);
export const GraphPermissionsSchema = z
  .object({
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    canCorrect: z.boolean(),
    canSuppress: z.boolean(),
  })
  .strict();

export type GraphNodeKind = z.infer<typeof GraphNodeKindSchema>;
export type GraphOwnerKind = z.infer<typeof GraphOwnerKindSchema>;
export type GraphFactClass = z.infer<typeof GraphFactClassSchema>;
export type GraphPermissions = z.infer<typeof GraphPermissionsSchema>;

export function graphPermissions(input: {
  factClass: GraphFactClass;
  canWriteSource: boolean;
  canManageCurated: boolean;
  assertedCorrection?: boolean;
}): GraphPermissions {
  if (input.factClass === 'authoritative')
    return {
      canEdit: false,
      canDelete: false,
      canCorrect: false,
      canSuppress: false,
    };
  if (input.factClass === 'extracted')
    return {
      canEdit: false,
      canDelete: false,
      canCorrect: input.canWriteSource,
      canSuppress: input.canWriteSource,
    };
  if (input.assertedCorrection)
    return {
      canEdit: false,
      canDelete: input.canWriteSource,
      canCorrect: false,
      canSuppress: false,
    };
  return {
    canEdit: input.canManageCurated,
    canDelete: input.canManageCurated,
    canCorrect: false,
    canSuppress: false,
  };
}
