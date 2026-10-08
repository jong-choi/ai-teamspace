// TODO(graph-05-orval): 임시 픽스처 mutation이다. graph-05 OpenAPI·Orval 생성 후 소비 component에서 generated mutation hook을 직접 사용하도록 바꾸고 이 파일을 삭제한다. 이 hook 모양을 유지하려는 adapter·barrel·re-export를 만들지 않는다.
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import type {
  GraphFixtureCorrectNode,
  GraphFixtureCreateEdge,
  GraphFixtureCreateNode,
  GraphFixtureUpdateEdge,
  GraphFixtureUpdateNode,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
import { graphFixtureKeys } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';
import {
  correctGraphFixtureNode,
  createGraphFixtureEdge,
  createGraphFixtureNode,
  deleteGraphFixtureEdge,
  deleteGraphFixtureNode,
  requestGraphFixtureWikiRefresh,
  updateGraphFixtureEdge,
  updateGraphFixtureNode,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-server';

import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

// PG 저장 성공과 그래프 반영 완료를 구분해서 알린다.
const SAVED_PENDING_DESCRIPTION =
  'PostgreSQL에 저장했습니다. 그래프 반영은 잠시 후 완료됩니다.';

function invalidateGraphLists(
  queryClient: QueryClient,
  organizationId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: graphFixtureKeys.exploreAll(organizationId),
    }),
    queryClient.invalidateQueries({
      queryKey: graphFixtureKeys.nodesAll(organizationId),
    }),
    queryClient.invalidateQueries({
      queryKey: graphFixtureKeys.edgesAll(organizationId),
    }),
  ]);
}

function invalidateNode(
  queryClient: QueryClient,
  organizationId: string,
  nodeId: string,
) {
  return Promise.all([
    invalidateGraphLists(queryClient, organizationId),
    queryClient.invalidateQueries({
      queryKey: graphFixtureKeys.node(organizationId, nodeId),
    }),
    queryClient.invalidateQueries({
      queryKey: graphFixtureKeys.nodeOptions(organizationId),
    }),
  ]);
}

function invalidateEdge(
  queryClient: QueryClient,
  organizationId: string,
  edge: { id: string; sourceNodeId: string; targetNodeId: string },
) {
  return Promise.all([
    invalidateGraphLists(queryClient, organizationId),
    queryClient.invalidateQueries({
      queryKey: graphFixtureKeys.edge(organizationId, edge.id),
    }),
    // 양끝 노드의 연결 수가 바뀐다.
    queryClient.invalidateQueries({
      queryKey: graphFixtureKeys.node(organizationId, edge.sourceNodeId),
    }),
    queryClient.invalidateQueries({
      queryKey: graphFixtureKeys.node(organizationId, edge.targetNodeId),
    }),
  ]);
}

export function useGraphFixtureNodeMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useMutationErrorNotification({
    fallback: '노드를 저장하지 못했습니다.',
    id: 'knowledge-graph-node',
    title: '노드 저장 실패',
  });
  const notifyDeleteError = useMutationErrorNotification({
    fallback: '노드를 삭제하지 못했습니다.',
    id: 'knowledge-graph-node-delete',
    title: '노드 삭제 실패',
  });

  const create = useMutation({
    mutationFn: (input: GraphFixtureCreateNode) =>
      createGraphFixtureNode(organizationId, input),
    onSuccess: (result) => {
      notifySuccess({
        title: '노드를 만들었습니다',
        description: SAVED_PENDING_DESCRIPTION,
      });
      return invalidateNode(queryClient, organizationId, result.id);
    },
    onError: notifyError,
  });
  const update = useMutation({
    mutationFn: ({
      nodeId,
      input,
    }: {
      nodeId: string;
      input: GraphFixtureUpdateNode;
    }) => updateGraphFixtureNode(organizationId, nodeId, input),
    onSuccess: (result) => {
      notifySuccess({
        title: '노드를 수정했습니다',
        description: SAVED_PENDING_DESCRIPTION,
      });
      return invalidateNode(queryClient, organizationId, result.id);
    },
    onError: notifyError,
  });
  const correct = useMutation({
    mutationFn: ({
      nodeId,
      input,
    }: {
      nodeId: string;
      input: GraphFixtureCorrectNode;
    }) => correctGraphFixtureNode(organizationId, nodeId, input),
    onSuccess: (result) => {
      notifySuccess({
        title: '추출 결과를 정정했습니다',
        description: SAVED_PENDING_DESCRIPTION,
      });
      return invalidateNode(queryClient, organizationId, result.id);
    },
    onError: notifyError,
  });
  const remove = useMutation({
    mutationFn: ({ nodeId, revision }: { nodeId: string; revision: number }) =>
      deleteGraphFixtureNode(organizationId, nodeId, revision),
    // 삭제된 상세 key는 다시 조회하지 않는다. 선택 해제는 호출한 화면이 맡는다.
    onSuccess: () => {
      notifySuccess({
        title: '노드를 삭제했습니다',
        description: SAVED_PENDING_DESCRIPTION,
      });
      return Promise.all([
        invalidateGraphLists(queryClient, organizationId),
        queryClient.invalidateQueries({
          queryKey: graphFixtureKeys.nodeOptions(organizationId),
        }),
      ]);
    },
    onError: notifyDeleteError,
  });

  return { create, update, correct, remove };
}

export function useGraphFixtureEdgeMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useMutationErrorNotification({
    fallback: '관계를 저장하지 못했습니다.',
    id: 'knowledge-graph-edge',
    title: '관계 저장 실패',
  });
  const notifyDeleteError = useMutationErrorNotification({
    fallback: '관계를 삭제하지 못했습니다.',
    id: 'knowledge-graph-edge-delete',
    title: '관계 삭제 실패',
  });

  const create = useMutation({
    mutationFn: (input: GraphFixtureCreateEdge) =>
      createGraphFixtureEdge(organizationId, input),
    onSuccess: (result, input) => {
      notifySuccess({
        title: '관계를 연결했습니다',
        description: SAVED_PENDING_DESCRIPTION,
      });
      return invalidateEdge(queryClient, organizationId, {
        id: result.id,
        ...input,
      });
    },
    onError: notifyError,
  });
  const update = useMutation({
    mutationFn: ({
      edgeId,
      input,
    }: {
      edgeId: string;
      input: GraphFixtureUpdateEdge;
      previous: { sourceNodeId: string; targetNodeId: string };
    }) => updateGraphFixtureEdge(organizationId, edgeId, input),
    onSuccess: (result, { input, previous }) => {
      notifySuccess({
        title: '관계를 수정했습니다',
        description: SAVED_PENDING_DESCRIPTION,
      });
      return Promise.all([
        invalidateEdge(queryClient, organizationId, {
          id: result.id,
          ...input,
        }),
        invalidateEdge(queryClient, organizationId, {
          id: result.id,
          ...previous,
        }),
      ]);
    },
    onError: notifyError,
  });
  const remove = useMutation({
    mutationFn: ({
      edgeId,
      revision,
    }: {
      edgeId: string;
      revision: number;
      sourceNodeId: string;
      targetNodeId: string;
    }) => deleteGraphFixtureEdge(organizationId, edgeId, revision),
    onSuccess: (_result, { sourceNodeId, targetNodeId }) => {
      notifySuccess({
        title: '관계를 삭제했습니다',
        description: SAVED_PENDING_DESCRIPTION,
      });
      return Promise.all([
        invalidateGraphLists(queryClient, organizationId),
        queryClient.invalidateQueries({
          queryKey: graphFixtureKeys.node(organizationId, sourceNodeId),
        }),
        queryClient.invalidateQueries({
          queryKey: graphFixtureKeys.node(organizationId, targetNodeId),
        }),
      ]);
    },
    onError: notifyDeleteError,
  });

  return { create, update, remove };
}

export function useGraphFixtureWikiRefreshMutation(
  organizationId: string,
  documentId: string,
) {
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useMutationErrorNotification({
    fallback: '지식 그래프 갱신을 요청하지 못했습니다.',
    id: 'knowledge-graph-wiki-refresh',
    title: '갱신 요청 실패',
  });

  return useMutation({
    mutationFn: () =>
      requestGraphFixtureWikiRefresh(organizationId, documentId),
    onSuccess: () => {
      // 202 accepted는 접수만 뜻한다. 완료는 status 조회로만 표시한다.
      notifySuccess({
        title: '갱신 요청됨',
        description: '저장된 문서를 기준으로 지식 그래프를 다시 만듭니다.',
      });
      return queryClient.invalidateQueries({
        queryKey: graphFixtureKeys.wikiIndex(organizationId, documentId),
      });
    },
    onError: notifyError,
  });
}
