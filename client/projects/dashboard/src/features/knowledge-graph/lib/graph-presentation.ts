import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';
import type { GraphProjectionState } from '@repo/client/api-client/generated/schemas/graphProjectionState.zod';

import {
  Box,
  Calendar,
  FileText,
  Lightbulb,
  type LucideIcon,
  Shapes,
  SquareCheck,
  UserRound,
} from 'lucide-react-native';

export const GRAPH_NODE_KIND_META: Record<
  GraphNode['kind'],
  { label: string; code: string; icon: LucideIcon }
> = {
  wiki_document: { label: '위키 문서', code: 'Wiki', icon: FileText },
  project: { label: '프로젝트', code: 'Project', icon: Box },
  ticket: { label: '티켓', code: 'Ticket', icon: SquareCheck },
  meeting: { label: '회의', code: 'Meeting', icon: Calendar },
  member: { label: '멤버', code: 'Member', icon: UserRound },
  curated_node: { label: '사용자 엔티티', code: 'Curated', icon: Shapes },
  semantic_entity: { label: 'AI 엔티티', code: 'Semantic', icon: Lightbulb },
};

// 색만으로 구분하지 않도록 선 패턴과 텍스트 라벨을 함께 쓴다.
export const GRAPH_FACT_CLASS_META: Record<
  GraphNode['factClass'],
  { label: string; description: string; dash: string | undefined }
> = {
  authoritative: {
    label: '확정',
    description:
      'AI Teamspace 원본에서 온 사실입니다. 원본 화면에서 수정합니다.',
    dash: undefined,
  },
  extracted: {
    label: 'AI 추출',
    description:
      '문서에서 AI가 추출한 사실입니다. 정정하거나 숨길 수 있습니다.',
    dash: '4 3',
  },
  user_curated: {
    label: '사용자',
    description: '사용자가 직접 정리한 사실입니다.',
    dash: '1 3',
  },
};

export const GRAPH_PROJECTION_META: Record<
  GraphProjectionState['status'],
  { label: string }
> = {
  applied: { label: '그래프 반영됨' },
  pending: { label: '그래프 반영 대기' },
  failed: { label: '그래프 반영 실패' },
  unknown: { label: '그래프 상태 확인 필요' },
};

export const GRAPH_PREDICATE_LABELS: Readonly<Record<string, string>> = {
  related_to: '관련',
  depends_on: '의존',
  contains: '포함',
  references: '참조',
};

export function formatPredicate(predicate: string): string {
  return predicate.toUpperCase();
}

export function truncateGraphLabel(label: string, maxLength = 18): string {
  const characters = [...label];
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength - 1).join('')}…`
    : label;
}

export function shortGraphId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-5)}` : id;
}
