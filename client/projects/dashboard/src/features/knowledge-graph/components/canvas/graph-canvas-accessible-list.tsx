import { View } from 'react-native';

import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';
import { Text } from '@repo/client/rnr/components/ui/text';

/** SVG를 읽지 못하는 화면리더가 같은 노드 집합을 순서대로 탐색한다. */
export function GraphCanvasAccessibleList({
  nodes,
}: {
  nodes: readonly GraphNode[];
}) {
  return (
    <View accessibilityLabel="그래프 노드 목록" className="sr-only">
      {nodes.map((node) => (
        <Text
          accessibilityLabel={`${node.title}, ${node.kind}, ${node.factClass}`}
          key={node.id}
        >
          {node.title}
        </Text>
      ))}
    </View>
  );
}
