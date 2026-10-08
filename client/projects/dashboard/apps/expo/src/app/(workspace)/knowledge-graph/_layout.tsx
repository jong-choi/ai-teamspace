import { Slot } from 'expo-router';

import { KnowledgeGraphLayout } from '@core/features/knowledge-graph/knowledge-graph-route';

export default function KnowledgeGraphRouteLayout() {
  return (
    <KnowledgeGraphLayout>
      <Slot />
    </KnowledgeGraphLayout>
  );
}
