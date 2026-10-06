import { View } from 'react-native';

import type {
  OrganizationMember,
  ProjectColumn,
  ProjectSummary,
  ProjectsControllerListTicketsParams,
} from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { getProjectColumnPresentation } from '@core/features/projects/lib/project-column-presentation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';

import { Search } from 'lucide-react-native';

const ALL = '__all__';

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '긴급' },
  { value: 'high', label: '높음' },
  { value: 'medium', label: '보통' },
  { value: 'low', label: '낮음' },
] as const;

type TicketPriorityFilter = ProjectsControllerListTicketsParams['priority'];

export function ProjectToolbar({
  assigneeUserId,
  columnId,
  columns,
  members,
  onAssigneeChange,
  onColumnChange,
  onPriorityChange,
  onProjectChange,
  onSearchChange,
  priority,
  projectId,
  projects,
  search,
}: {
  assigneeUserId?: string;
  columnId?: string;
  columns: readonly ProjectColumn[];
  members: readonly OrganizationMember[];
  onAssigneeChange: (value: string | undefined) => void;
  onColumnChange: (value: string | undefined) => void;
  onPriorityChange: (value: TicketPriorityFilter) => void;
  onProjectChange: (projectId: string) => void;
  onSearchChange: (value: string) => void;
  priority?: TicketPriorityFilter;
  projectId: string;
  projects: readonly ProjectSummary[];
  search: string;
}) {
  const project = projects.find(({ id }) => id === projectId);
  const column = columns.find(({ id }) => id === columnId);
  const columnPresentation = column
    ? getProjectColumnPresentation(column.name)
    : undefined;
  const assignee = members.find(({ userId }) => userId === assigneeUserId);
  const selectedPriority = PRIORITY_OPTIONS.find(
    (option) => option.value === priority,
  );

  return (
    <View className="flex-row flex-wrap items-center gap-2.5 border-b border-border bg-muted/30 px-4 py-2.5 lg:px-6">
      <View className="relative min-w-[200px] flex-1 sm:max-w-72">
        <View className="pointer-events-none absolute inset-y-0 left-3 z-10 items-center justify-center">
          <Icon as={Search} className="size-3.5 text-muted-foreground" />
        </View>
        <Input
          accessibilityLabel="이슈 검색"
          className="h-8 pl-8 text-xs"
          onChangeText={onSearchChange}
          placeholder="이슈 검색..."
          value={search}
        />
      </View>

      <CompactSelect
        accessibilityLabel="프로젝트 필터"
        onValueChange={(value) => value !== ALL && onProjectChange(value)}
        options={projects.map((item) => ({
          label: `${item.key} · ${item.name}`,
          value: item.id,
        }))}
        placeholder="프로젝트"
        value={
          project
            ? { label: `${project.key} · ${project.name}`, value: project.id }
            : undefined
        }
      />

      <CompactSelect
        accessibilityLabel="상태 필터"
        onValueChange={(value) =>
          onColumnChange(value === ALL ? undefined : value)
        }
        options={[
          { label: '전체 상태', value: ALL },
          ...columns.map((item) => ({
            label: getProjectColumnPresentation(item.name).label,
            value: item.id,
          })),
        ]}
        placeholder="상태"
        value={
          column && columnPresentation
            ? { label: columnPresentation.label, value: column.id }
            : { label: '전체 상태', value: ALL }
        }
      />

      <CompactSelect
        accessibilityLabel="담당자 필터"
        onValueChange={(value) =>
          onAssigneeChange(value === ALL ? undefined : value)
        }
        options={[
          { label: '전체 담당자', value: ALL },
          ...members.map((member) => ({
            label: member.user.name,
            value: member.userId,
          })),
        ]}
        placeholder="담당자"
        value={
          assignee
            ? { label: assignee.user.name, value: assignee.userId }
            : { label: '전체 담당자', value: ALL }
        }
      />

      <CompactSelect
        accessibilityLabel="우선순위 필터"
        onValueChange={(value) =>
          onPriorityChange(value === ALL ? undefined : parsePriority(value))
        }
        options={[{ label: '전체 우선순위', value: ALL }, ...PRIORITY_OPTIONS]}
        placeholder="우선순위"
        value={
          selectedPriority
            ? selectedPriority
            : { label: '전체 우선순위', value: ALL }
        }
      />
    </View>
  );
}

function parsePriority(value: string): TicketPriorityFilter {
  return PRIORITY_OPTIONS.find((option) => option.value === value)?.value;
}

function CompactSelect({
  accessibilityLabel,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  onValueChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  placeholder: string;
  value?: { label: string; value: string };
}) {
  return (
    <Select
      onValueChange={(option) => option?.value && onValueChange(option.value)}
      value={value}
    >
      <SelectTrigger
        accessibilityLabel={accessibilityLabel}
        className="h-8 min-w-32 max-w-52"
        size="sm"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start" side="bottom">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            label={option.label}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
