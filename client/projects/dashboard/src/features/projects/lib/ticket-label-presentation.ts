import type { TicketLabel } from '@repo/client/api-client/schemas';

const LABEL_CLASSES: Record<
  TicketLabel['color'],
  { container: string; foreground: string }
> = {
  neutral: {
    container: 'bg-zinc-500/10',
    foreground: 'text-zinc-600 dark:text-zinc-300',
  },
  red: {
    container: 'bg-red-500/10',
    foreground: 'text-red-600 dark:text-red-400',
  },
  orange: {
    container: 'bg-orange-500/10',
    foreground: 'text-orange-600 dark:text-orange-400',
  },
  amber: {
    container: 'bg-amber-500/10',
    foreground: 'text-amber-600 dark:text-amber-400',
  },
  green: {
    container: 'bg-emerald-500/10',
    foreground: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    container: 'bg-blue-500/10',
    foreground: 'text-blue-600 dark:text-blue-400',
  },
  violet: {
    container: 'bg-violet-500/10',
    foreground: 'text-violet-600 dark:text-violet-400',
  },
  pink: {
    container: 'bg-pink-500/10',
    foreground: 'text-pink-600 dark:text-pink-400',
  },
};

export function getTicketLabelClasses(color: TicketLabel['color']) {
  return LABEL_CLASSES[color];
}
