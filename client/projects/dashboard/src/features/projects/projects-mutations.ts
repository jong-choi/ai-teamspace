import {
  getProjectsControllerGetProjectQueryKey,
  getProjectsControllerListProjectsQueryKey,
  getProjectsControllerListTicketsQueryKey,
  useProjectsControllerCreateProject,
  useProjectsControllerCreateTicket,
  useTicketWorkflowControllerMoveTicket,
} from '@repo/client/api-client';
import type {
  CreateProject,
  CreateTicket,
  MoveTicket,
  ProjectsControllerListTicketsParams,
  TicketList,
} from '@repo/client/api-client/schemas';
import { MoveTicket as MoveTicketSchema } from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import {
  applyCanonicalTicketMove,
  applyOptimisticTicketMove,
} from '@core/features/projects/lib/kanban-cache';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

export function useCreateProjectMutation(organizationId: string) {
  const queryClient = useQueryClient();
  const notifyError = useMutationErrorNotification({
    id: 'project-create-error',
    title: '프로젝트를 만들지 못했습니다',
    fallback: '입력값과 조직 권한을 확인한 뒤 다시 시도해 주세요.',
  });
  const mutation = useProjectsControllerCreateProject({
    mutation: {
      onError: notifyError,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: getProjectsControllerListProjectsQueryKey(organizationId),
        });
      },
    },
  });

  return {
    create: (data: CreateProject, onSuccess?: () => void) =>
      mutation.mutate({ organizationId, data }, { onSuccess }),
    isPending: mutation.isPending,
  };
}

export function useCreateTicketMutation(
  organizationId: string,
  projectId: string,
) {
  const queryClient = useQueryClient();
  const notifyError = useMutationErrorNotification({
    id: 'ticket-create-error',
    title: '이슈를 만들지 못했습니다',
    fallback: '입력값과 프로젝트 상태를 확인한 뒤 다시 시도해 주세요.',
  });
  const mutation = useProjectsControllerCreateTicket({
    mutation: {
      onError: notifyError,
      onSuccess: async () => {
        await invalidateProjectQueries(queryClient, organizationId, projectId);
      },
    },
  });

  return {
    create: (data: CreateTicket, onSuccess?: () => void) =>
      mutation.mutate({ organizationId, projectId, data }, { onSuccess }),
    isPending: mutation.isPending,
  };
}

type MoveTicketCacheContext = {
  previous?: TicketList;
};

export function useMoveTicketMutation({
  organizationId,
  params,
  projectId,
}: {
  organizationId: string;
  projectId: string;
  params: ProjectsControllerListTicketsParams;
}) {
  const queryClient = useQueryClient();
  const queryKey = getProjectsControllerListTicketsQueryKey(
    organizationId,
    projectId,
    params,
  );
  const notifyError = useMutationErrorNotification({
    id: 'ticket-move-error',
    title: '이슈를 이동하지 못했습니다',
    fallback: '보드가 이전 상태로 복구되었습니다. 다시 시도해 주세요.',
  });
  const mutation = useTicketWorkflowControllerMoveTicket<
    Error,
    MoveTicketCacheContext
  >({
    mutation: {
      onMutate: async (variables) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData<TicketList>(queryKey);
        if (previous) {
          queryClient.setQueryData<TicketList>(
            queryKey,
            applyOptimisticTicketMove(
              previous,
              variables.ticketId,
              variables.data,
              params,
            ),
          );
        }
        return { previous };
      },
      onError: (error, _variables, context) => {
        if (context?.previous) {
          queryClient.setQueryData(queryKey, context.previous);
        }
        notifyError(error);
      },
      onSuccess: (result) => {
        queryClient.setQueryData<TicketList | undefined>(queryKey, (current) =>
          applyCanonicalTicketMove(current, result),
        );
      },
      onSettled: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey }),
          invalidateProjectQueries(queryClient, organizationId, projectId),
        ]);
      },
    },
  });

  return {
    isPending: mutation.isPending,
    move: (ticketId: string, input: MoveTicket) =>
      mutation.mutate({
        organizationId,
        projectId,
        ticketId,
        data: MoveTicketSchema.parse(input),
      }),
  };
}

function invalidateProjectQueries(
  queryClient: QueryClient,
  organizationId: string,
  projectId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      exact: false,
      queryKey: getProjectsControllerListTicketsQueryKey(
        organizationId,
        projectId,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: getProjectsControllerListProjectsQueryKey(organizationId),
    }),
    queryClient.invalidateQueries({
      queryKey: getProjectsControllerGetProjectQueryKey(
        organizationId,
        projectId,
      ),
    }),
  ]);
}
