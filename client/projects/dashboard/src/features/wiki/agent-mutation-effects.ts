import type { WikiDocumentMutationReceiptOutput } from '@repo/client/api-client/schemas';
import {
  invalidateWikiDocument,
  invalidateWikiTree,
} from '@core/features/wiki/use-wiki-mutations';

import type { QueryClient } from '@tanstack/react-query';

// Agent가 위키 문서를 만들거나 바꿨을 때 문서 트리와 해당 문서를 다시 불러온다.
export async function applyWikiAgentMutation(
  queryClient: QueryClient,
  receipt: WikiDocumentMutationReceiptOutput,
): Promise<void> {
  await Promise.all([
    invalidateWikiTree(queryClient, receipt.organizationId),
    invalidateWikiDocument(
      queryClient,
      receipt.organizationId,
      receipt.resourceId,
    ),
  ]);
}
