export type TicketMutationScope = {
  organizationId: string;
  projectId: string;
  ticketId: string;
};

export type MutationDone = () => void;

export type MutationCallbacks = {
  onError?: MutationDone;
  onSuccess?: MutationDone;
};
