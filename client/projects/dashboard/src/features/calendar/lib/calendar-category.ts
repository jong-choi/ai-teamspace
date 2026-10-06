import type { MeetingSummary } from '@repo/client/api-client/schemas';

export type CalendarCategory = MeetingSummary['category'];

export const CALENDAR_CATEGORIES: readonly CalendarCategory[] = [
  'team',
  'sprint',
  '1on1',
  'allhands',
  'client',
];

export const CALENDAR_CATEGORY_META: Record<
  CalendarCategory,
  {
    label: string;
    chipClassName: string;
    chipTextClassName: string;
    badgeClassName: string;
    badgeTextClassName: string;
    dotClassName: string;
  }
> = {
  team: {
    label: '팀 회의',
    chipClassName: 'border-blue-500/20 bg-blue-500/10',
    chipTextClassName: 'text-blue-700 dark:text-blue-300',
    badgeClassName: 'border-blue-500/20 bg-blue-500/10',
    badgeTextClassName: 'text-blue-600 dark:text-blue-400',
    dotClassName: 'bg-blue-500',
  },
  sprint: {
    label: '스프린트',
    chipClassName: 'border-emerald-500/20 bg-emerald-500/10',
    chipTextClassName: 'text-emerald-700 dark:text-emerald-300',
    badgeClassName: 'border-emerald-500/20 bg-emerald-500/10',
    badgeTextClassName: 'text-emerald-600 dark:text-emerald-400',
    dotClassName: 'bg-emerald-500',
  },
  '1on1': {
    label: '1:1 면담',
    chipClassName: 'border-violet-500/20 bg-violet-500/10',
    chipTextClassName: 'text-violet-700 dark:text-violet-300',
    badgeClassName: 'border-violet-500/20 bg-violet-500/10',
    badgeTextClassName: 'text-violet-600 dark:text-violet-400',
    dotClassName: 'bg-violet-500',
  },
  allhands: {
    label: '전사 공유',
    chipClassName: 'border-amber-500/20 bg-amber-500/10',
    chipTextClassName: 'text-amber-700 dark:text-amber-300',
    badgeClassName: 'border-amber-500/20 bg-amber-500/10',
    badgeTextClassName: 'text-amber-600 dark:text-amber-400',
    dotClassName: 'bg-amber-500',
  },
  client: {
    label: '고객사 미팅',
    chipClassName: 'border-rose-500/20 bg-rose-500/10',
    chipTextClassName: 'text-rose-700 dark:text-rose-300',
    badgeClassName: 'border-rose-500/20 bg-rose-500/10',
    badgeTextClassName: 'text-rose-600 dark:text-rose-400',
    dotClassName: 'bg-rose-500',
  },
};

export function getCalendarCategoryLabel(category: CalendarCategory): string {
  return CALENDAR_CATEGORY_META[category].label;
}
