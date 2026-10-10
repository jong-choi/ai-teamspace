import type { TicketSummary } from '@repo/client/api-client/schemas';

import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Minus,
} from 'lucide-react-native';

export type TicketPriority = TicketSummary['priority'];

const TICKET_PRIORITY_PRESENTATION = {
  urgent: {
    label: '긴급',
    icon: AlertCircle,
    badgeContainerClass: 'border-red-500/20 bg-red-500/10',
    badgeForegroundClass: 'text-red-600 dark:text-red-400',
    listForegroundClass: 'text-red-500 dark:text-red-400',
  },
  high: {
    label: '높음',
    icon: ChevronUp,
    badgeContainerClass: 'border-amber-500/20 bg-amber-500/10',
    badgeForegroundClass: 'text-amber-600 dark:text-amber-400',
    listForegroundClass: 'text-amber-500 dark:text-amber-400',
  },
  medium: {
    label: '보통',
    icon: Minus,
    badgeContainerClass: 'border-blue-500/20 bg-blue-500/10',
    badgeForegroundClass: 'text-blue-600 dark:text-blue-400',
    listForegroundClass: 'text-blue-500 dark:text-blue-400',
  },
  low: {
    label: '낮음',
    icon: ChevronDown,
    badgeContainerClass: 'border-border bg-muted',
    badgeForegroundClass: 'text-muted-foreground',
    listForegroundClass: 'text-muted-foreground',
  },
} as const satisfies Record<
  TicketPriority,
  {
    label: string;
    icon: typeof AlertCircle;
    badgeContainerClass: string;
    badgeForegroundClass: string;
    listForegroundClass: string;
  }
>;

export const TICKET_PRIORITY_OPTIONS = (
  [
    'urgent',
    'high',
    'medium',
    'low',
  ] as const satisfies readonly TicketPriority[]
).map((value) => ({
  value,
  label: TICKET_PRIORITY_PRESENTATION[value].label,
}));

export function getTicketPriorityPresentation(priority: TicketPriority) {
  return TICKET_PRIORITY_PRESENTATION[priority];
}
