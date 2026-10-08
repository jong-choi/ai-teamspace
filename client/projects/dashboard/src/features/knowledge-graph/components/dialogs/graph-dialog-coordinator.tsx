import {
  GraphEdgeDeleteDialog,
  GraphNodeDeleteDialog,
} from '@core/features/knowledge-graph/components/dialogs/graph-delete-dialog';
import { GraphEdgeDialog } from '@core/features/knowledge-graph/components/dialogs/graph-edge-dialog';
import { GraphNodeDialog } from '@core/features/knowledge-graph/components/dialogs/graph-node-dialog';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

/**
 * 그래프 뷰와 데이터 센터가 같은 모달·mutation 경로를 쓰도록 한 곳에서 띄운다.
 * store에 열린 모달이 하나뿐이라 dirty form이 동시에 둘 열리지 않는다.
 */
export function GraphDialogCoordinator({
  organizationId,
}: {
  organizationId: string;
}) {
  const dialog = useGraphStudioStore((state) => state.dialog);
  if (!dialog) return null;

  switch (dialog.type) {
    case 'node-create':
      return <GraphNodeDialog mode="create" organizationId={organizationId} />;
    case 'node-edit':
      return (
        <GraphNodeDialog
          key={dialog.nodeId}
          mode="edit"
          nodeId={dialog.nodeId}
          organizationId={organizationId}
        />
      );
    case 'node-correct':
      return (
        <GraphNodeDialog
          key={dialog.nodeId}
          mode="correct"
          nodeId={dialog.nodeId}
          organizationId={organizationId}
        />
      );
    case 'node-delete':
      return (
        <GraphNodeDeleteDialog
          key={dialog.nodeId}
          nodeId={dialog.nodeId}
          organizationId={organizationId}
        />
      );
    case 'edge-create':
      return (
        <GraphEdgeDialog
          organizationId={organizationId}
          sourceNodeId={dialog.sourceNodeId}
        />
      );
    case 'edge-edit':
      return (
        <GraphEdgeDialog
          edgeId={dialog.edgeId}
          key={dialog.edgeId}
          organizationId={organizationId}
        />
      );
    case 'edge-delete':
      return (
        <GraphEdgeDeleteDialog
          edgeId={dialog.edgeId}
          key={dialog.edgeId}
          organizationId={organizationId}
        />
      );
  }
}
