import { CreateCuratedEdgeCommand } from '@repo/client/api-client/generated/schemas/createCuratedEdgeCommand.zod';
import type { CuratedEndpointOptions } from '@repo/client/api-client/generated/schemas/curatedEndpointOptions.zod';
import type { GraphEdge } from '@repo/client/api-client/generated/schemas/graphEdge.zod';
import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';
import { Select, SelectContent } from '@repo/client/rnr/components/ui/select';
import {
  DashboardSelectItem,
  DashboardSelectTrigger,
  DashboardSelectValue,
} from '@core/app/ui/dashboard-select';
import { GraphFormField } from '@core/features/knowledge-graph/components/dialogs/graph-dialog-frame';
import {
  formatPredicate,
  GRAPH_PREDICATE_LABELS,
} from '@core/features/knowledge-graph/lib/graph-presentation';

export type EndpointOption = CuratedEndpointOptions['items'][number];
export const CURATED_PREDICATES =
  CreateCuratedEdgeCommand.shape.predicate.options;

export function GraphNodeSelectField({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (option: EndpointOption) => void;
  options: readonly EndpointOption[];
  value: EndpointOption | null;
}) {
  return (
    <GraphFormField label={label}>
      <Select
        disabled={disabled}
        onValueChange={(selected) => {
          const option = options.find(
            (item) => item.nodeId === selected?.value,
          );
          if (option) onChange(option);
        }}
        value={
          value
            ? { value: value.nodeId, label: nodeOptionLabel(value) }
            : undefined
        }
      >
        <DashboardSelectTrigger
          accessibilityLabel={`${label} 선택`}
          className="w-full"
        >
          <DashboardSelectValue placeholder="노드 선택" />
        </DashboardSelectTrigger>
        <SelectContent align="start" className="max-h-72" side="bottom">
          {options.map((option) => (
            <DashboardSelectItem
              key={`${option.kind}:${option.nodeId}`}
              label={nodeOptionLabel(option)}
              value={option.nodeId}
            >
              {nodeOptionLabel(option)}
            </DashboardSelectItem>
          ))}
        </SelectContent>
      </Select>
    </GraphFormField>
  );
}

export function endpointFromEdge(
  edge: GraphEdge | undefined,
  side: 'source' | 'target',
  options: readonly EndpointOption[],
) {
  const id =
    side === 'source'
      ? edge?.curated?.sourceNodeId
      : edge?.curated?.targetNodeId;
  const kind =
    side === 'source'
      ? edge?.curated?.sourceNodeKind
      : edge?.curated?.targetNodeKind;
  return (
    options.find((option) => option.nodeId === id && option.kind === kind) ??
    null
  );
}

export function toEndpoint(node: GraphNode): EndpointOption | null {
  const source = node.sourceRef;
  if (!source || source.kind === 'member') return null;
  return {
    nodeId: source.id,
    kind: source.kind,
    title: node.title,
    allowedPredicates:
      source.kind === 'curated_node' ? [...CURATED_PREDICATES] : ['references'],
  };
}

export function mergeEndpoint(
  options: readonly EndpointOption[],
  endpoint: EndpointOption | null | undefined,
) {
  if (!endpoint || options.some((item) => item.nodeId === endpoint.nodeId))
    return options;
  return [endpoint, ...options];
}

function nodeOptionLabel(option: EndpointOption) {
  return `${option.title} · ${option.kind}`;
}

export function predicateLabel(predicate: (typeof CURATED_PREDICATES)[number]) {
  return `${formatPredicate(predicate)} (${GRAPH_PREDICATE_LABELS[predicate]})`;
}
