import { useLocalSearchParams } from 'expo-router';

import { WikiRoute } from '@core/features/wiki/wiki-route';

export default function WikiDocumentRoute() {
  const params = useLocalSearchParams<{ documentId: string }>();
  const documentId = Array.isArray(params.documentId)
    ? params.documentId[0]
    : params.documentId;

  return <WikiRoute documentId={documentId} />;
}
