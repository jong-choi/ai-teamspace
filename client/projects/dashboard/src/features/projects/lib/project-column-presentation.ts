export type ProjectColumnPresentation = {
  dotClassName: string;
  label: string;
};

const DEFAULT_COLUMN_PRESENTATION: Readonly<
  Record<string, ProjectColumnPresentation>
> = {
  Backlog: { label: '백로그', dotClassName: 'bg-zinc-400' },
  Todo: { label: '할 일', dotClassName: 'bg-blue-500' },
  'In Progress': { label: '진행 중', dotClassName: 'bg-amber-500' },
  'In Review': { label: '검토 중', dotClassName: 'bg-purple-500' },
  Done: { label: '완료', dotClassName: 'bg-emerald-500' },
};

export function getProjectColumnPresentation(
  name: string,
): ProjectColumnPresentation {
  return (
    DEFAULT_COLUMN_PRESENTATION[name] ?? {
      label: name,
      dotClassName: 'bg-muted-foreground/60',
    }
  );
}
