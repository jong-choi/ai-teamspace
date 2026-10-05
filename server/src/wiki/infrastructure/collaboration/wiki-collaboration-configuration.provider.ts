import type { CollaborationEnvironment } from '#server/config/runtime-environment.js';

export const WIKI_COLLABORATION_ENVIRONMENT = Symbol(
  'WIKI_COLLABORATION_ENVIRONMENT',
);
export type WikiCollaborationEnvironment = CollaborationEnvironment;
