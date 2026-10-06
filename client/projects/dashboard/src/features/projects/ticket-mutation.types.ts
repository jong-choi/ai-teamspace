import type { ProjectsControllerUpdateTicketMutationVariables } from '@repo/client/api-client';

export type TicketMutationScope = Omit<
  ProjectsControllerUpdateTicketMutationVariables,
  'data'
>;

export type MutationDone = () => void;

export type MutationCallbacks = {
  onError?: MutationDone;
  onSuccess?: MutationDone;
};
