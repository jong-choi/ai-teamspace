import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';

export type GraphRecordAction =
  'edit' | 'delete' | 'correct' | 'suppress' | 'open-source';

/**
 * 서버가 내려준 permissions와 factClass로 보여줄 버튼만 정한다.
 * 화면 표시용이며 실제 권한은 서버가 저장 시점에 다시 검사한다.
 */
export function getGraphRecordActions(record: {
  factClass: GraphNode['factClass'];
  permissions: GraphNode['permissions'];
  editTarget: GraphNode['editTarget'];
}): ReadonlySet<GraphRecordAction> {
  const actions = new Set<GraphRecordAction>();
  if (record.factClass === 'user_curated') {
    if (record.permissions.canEdit) actions.add('edit');
    if (record.permissions.canDelete) actions.add('delete');
  }
  if (record.factClass === 'extracted') {
    if (record.permissions.canCorrect) actions.add('correct');
    if (record.permissions.canSuppress) actions.add('suppress');
  }
  if (
    record.editTarget.kind === 'owner' &&
    (record.editTarget.ownerKind === 'wiki_document' ||
      record.editTarget.ownerKind === 'project')
  )
    actions.add('open-source');
  return actions;
}
