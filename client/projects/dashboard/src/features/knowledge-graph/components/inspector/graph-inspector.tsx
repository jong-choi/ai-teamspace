import { View } from 'react-native';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { GraphEdgeInspector } from '@core/features/knowledge-graph/components/inspector/graph-edge-inspector';
import {
  GraphInspectorEmpty,
  GraphInspectorSkeleton,
} from '@core/features/knowledge-graph/components/inspector/graph-inspector-frame';
import { GraphNodeInspector } from '@core/features/knowledge-graph/components/inspector/graph-node-inspector';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';
import type { GraphSelection } from '@core/features/knowledge-graph/state/graph-studio-store';

/** 넓은 화면의 우측 320px 고정 인스펙터. */
export function GraphInspectorPanel({
  organizationId,
}: {
  organizationId: string;
}) {
  const selection = useGraphStudioStore((state) => state.selection);
  return (
    <View className="w-80 shrink-0 border-l border-border bg-background/95 shadow-lg shadow-black/5">
      <GraphInspectorBody
        organizationId={organizationId}
        selection={selection}
      />
    </View>
  );
}

/** 좁은 화면과 데이터 센터에서는 같은 내용을 Dialog로 띄운다. */
export function GraphInspectorDialog({
  organizationId,
}: {
  organizationId: string;
}) {
  const selection = useGraphStudioStore((state) => state.selection);
  const clearSelection = useGraphStudioStore((state) => state.clearSelection);
  // 편집 모달이 열리면 상세 Dialog를 닫아 두 Dialog가 겹치지 않게 한다.
  const editing = useGraphStudioStore((state) => state.dialog !== null);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) clearSelection();
      }}
      open={selection !== null && !editing}
    >
      <DialogContent className="h-[80%] max-h-[640px] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md web:w-[min(28rem,calc(100vw-2rem))]">
        <DialogTitle className="sr-only">엔티티 상세</DialogTitle>
        {selection ? (
          <GraphInspectorBody
            headerClassName="pr-8"
            organizationId={organizationId}
            selection={selection}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function GraphInspectorBody({
  headerClassName,
  organizationId,
  selection,
}: {
  headerClassName?: string;
  organizationId: string;
  selection: GraphSelection | null;
}) {
  if (!selection)
    return <GraphInspectorEmpty headerClassName={headerClassName} />;

  // 선택 대상마다 경계를 새로 만들어 이전 선택의 오류·로딩을 남기지 않는다.
  return (
    <DashboardQueryBoundary
      description="선택한 항목이 삭제되었거나 접근 권한이 바뀌었을 수 있습니다."
      fallback={<GraphInspectorSkeleton headerClassName={headerClassName} />}
      key={`${selection.kind}:${selection.id}`}
      title="상세 정보를 불러오지 못했습니다"
    >
      {selection.kind === 'node' ? (
        <GraphNodeInspector
          headerClassName={headerClassName}
          nodeId={selection.id}
          organizationId={organizationId}
        />
      ) : (
        <GraphEdgeInspector
          edgeId={selection.id}
          headerClassName={headerClassName}
          organizationId={organizationId}
        />
      )}
    </DashboardQueryBoundary>
  );
}
