import {
  resolveWikiRelativeSelection,
  WikiRelativeSelectionSchema,
  type WikiTextSelection,
} from '@core/features/wiki/collaboration/wiki-relative-selection';

import * as Y from 'yjs';
import { z } from 'zod';

const wikiAwarenessUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
});

const wikiAwarenessStateSchema = z.object({
  user: wikiAwarenessUserSchema,
  selection: WikiRelativeSelectionSchema.nullish(),
});

export type WikiCollaborator = {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  selection: WikiTextSelection | null;
};

export function collectWikiCollaborators(input: {
  document: Y.Doc;
  text: Y.Text;
  states: ReadonlyMap<number, unknown>;
  localClientId?: number;
}): WikiCollaborator[] {
  const collaboratorsByUserId = new Map<string, WikiCollaborator>();
  for (const [clientId, state] of input.states) {
    if (clientId === input.localClientId) continue;
    const parsed = wikiAwarenessStateSchema.safeParse(state);
    if (!parsed.success) continue;
    const collaborator: WikiCollaborator = {
      clientId,
      userId: parsed.data.user.id,
      name: parsed.data.user.name,
      color: parsed.data.user.color,
      selection: parsed.data.selection
        ? resolveWikiRelativeSelection(
            input.document,
            input.text,
            parsed.data.selection,
          )
        : null,
    };
    const existing = collaboratorsByUserId.get(collaborator.userId);
    if (!existing || collaborator.clientId < existing.clientId) {
      collaboratorsByUserId.set(collaborator.userId, collaborator);
    }
  }

  return [...collaboratorsByUserId.values()].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, 'ko');
    return byName === 0 ? left.userId.localeCompare(right.userId) : byName;
  });
}
