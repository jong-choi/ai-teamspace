import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type {
  CreateTicketChecklist,
  CreateTicketChecklistItem,
  MoveTicketChecklistItem,
  TicketChecklist,
  UpdateTicketChecklist,
  UpdateTicketChecklistItem,
} from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

import {
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from 'lucide-react-native';

type MutationCallbacks = {
  onError?: () => void;
  onSuccess?: () => void;
};

export function TicketChecklistSection({
  checklists,
  disabled,
  onAddItem,
  onCreateChecklist,
  onMoveItem,
  onRemoveChecklist,
  onRemoveItem,
  onUpdateChecklist,
  onUpdateItem,
}: {
  checklists: readonly TicketChecklist[];
  disabled: boolean;
  onAddItem: (
    checklistId: string,
    data: CreateTicketChecklistItem,
    onSuccess?: () => void,
  ) => void;
  onCreateChecklist: (
    data: CreateTicketChecklist,
    onSuccess?: () => void,
  ) => void;
  onMoveItem: (
    checklistId: string,
    itemId: string,
    data: MoveTicketChecklistItem,
  ) => void;
  onRemoveChecklist: (checklistId: string) => void;
  onRemoveItem: (checklistId: string, itemId: string) => void;
  onUpdateChecklist: (
    checklistId: string,
    data: UpdateTicketChecklist,
    callbacks?: MutationCallbacks,
  ) => void;
  onUpdateItem: (
    checklistId: string,
    itemId: string,
    data: UpdateTicketChecklistItem,
    callbacks?: MutationCallbacks,
  ) => void;
}) {
  const [newChecklistTitle, setNewChecklistTitle] = useState('');

  return (
    <View className="gap-3 pt-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold text-muted-foreground">
          하위 작업 (Checklist)
        </Text>
      </View>

      {checklists.length === 0 ? (
        <Text className="py-1 text-xs text-muted-foreground">
          등록된 하위 작업이 없습니다.
        </Text>
      ) : (
        checklists.map((checklist) => (
          <ChecklistBlock
            checklist={checklist}
            disabled={disabled}
            key={checklist.id}
            onAddItem={onAddItem}
            onMoveItem={onMoveItem}
            onRemove={() => onRemoveChecklist(checklist.id)}
            onRemoveItem={onRemoveItem}
            onUpdate={(data) => onUpdateChecklist(checklist.id, data)}
            onUpdateItem={onUpdateItem}
          />
        ))
      )}

      <View className="flex-row items-center gap-2 pt-1">
        <Input
          accessibilityLabel="체크리스트 추가"
          className="h-8 flex-1 text-xs"
          editable={!disabled}
          onChangeText={setNewChecklistTitle}
          onSubmitEditing={() => {
            const title = newChecklistTitle.trim();
            if (!title) return;
            onCreateChecklist({ title }, () => setNewChecklistTitle(''));
          }}
          placeholder="새 체크리스트 추가..."
          value={newChecklistTitle}
        />
        <Pressable
          accessibilityLabel="체크리스트 추가"
          className="h-8 flex-row items-center gap-1 rounded-md bg-secondary px-2.5 disabled:opacity-50"
          disabled={disabled || !newChecklistTitle.trim()}
          onPress={() => {
            const title = newChecklistTitle.trim();
            if (!title) return;
            onCreateChecklist({ title }, () => setNewChecklistTitle(''));
          }}
        >
          <Icon as={Plus} className="size-3 text-secondary-foreground" />
          <Text className="text-xs font-medium">추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChecklistBlock({
  checklist,
  disabled,
  onAddItem,
  onMoveItem,
  onRemove,
  onRemoveItem,
  onUpdate,
  onUpdateItem,
}: {
  checklist: TicketChecklist;
  disabled: boolean;
  onAddItem: (
    checklistId: string,
    data: CreateTicketChecklistItem,
    onSuccess?: () => void,
  ) => void;
  onMoveItem: (
    checklistId: string,
    itemId: string,
    data: MoveTicketChecklistItem,
  ) => void;
  onRemove: () => void;
  onRemoveItem: (checklistId: string, itemId: string) => void;
  onUpdate: (
    data: UpdateTicketChecklist,
    callbacks?: MutationCallbacks,
  ) => void;
  onUpdateItem: (
    checklistId: string,
    itemId: string,
    data: UpdateTicketChecklistItem,
    callbacks?: MutationCallbacks,
  ) => void;
}) {
  const [title, setTitle] = useState(checklist.title);
  const [newItemTitle, setNewItemTitle] = useState('');
  const sortedItems = [...checklist.items].sort(
    (left, right) =>
      left.position - right.position || left.id.localeCompare(right.id),
  );
  const completed = sortedItems.filter(({ completed }) => completed).length;
  const progress =
    sortedItems.length === 0
      ? 0
      : Math.round((completed / sortedItems.length) * 100);

  useEffect(() => setTitle(checklist.title), [checklist.title]);

  const addItem = () => {
    const itemTitle = newItemTitle.trim();
    if (!itemTitle) return;
    onAddItem(checklist.id, { title: itemTitle }, () => setNewItemTitle(''));
  };

  return (
    <View className="gap-2 rounded-lg border border-border/70 p-2.5">
      <View className="flex-row items-center gap-2">
        <Input
          accessibilityLabel="체크리스트 이름"
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs font-semibold"
          editable={!disabled}
          onBlur={() => {
            const next = title.trim();
            if (!next) {
              setTitle(checklist.title);
              return;
            }
            if (next !== checklist.title) {
              onUpdate(
                { title: next },
                { onError: () => setTitle(checklist.title) },
              );
            }
          }}
          onChangeText={setTitle}
          value={title}
        />
        <Text className="font-mono text-[10px] text-muted-foreground">
          {completed}/{sortedItems.length}
        </Text>
        <Pressable
          accessibilityLabel="체크리스트 삭제"
          disabled={disabled}
          onPress={onRemove}
        >
          <Icon as={Trash2} className="size-3.5 text-muted-foreground" />
        </Pressable>
      </View>

      {sortedItems.length > 0 ? (
        <View className="h-1 overflow-hidden rounded-full bg-muted">
          <View
            className="h-full rounded-full bg-foreground"
            style={{ width: `${progress}%` }}
          />
        </View>
      ) : null}

      <View className="gap-1">
        {sortedItems.map((item, index) => (
          <ChecklistItemRow
            checklistId={checklist.id}
            disabled={disabled}
            index={index}
            item={item}
            items={sortedItems}
            key={item.id}
            onMoveItem={onMoveItem}
            onRemoveItem={onRemoveItem}
            onUpdateItem={onUpdateItem}
          />
        ))}
      </View>

      <View className="flex-row items-center gap-2 pt-1">
        <Input
          accessibilityLabel="하위 작업 추가"
          className="h-8 flex-1 text-xs"
          editable={!disabled}
          onChangeText={setNewItemTitle}
          onSubmitEditing={addItem}
          placeholder="새 하위 작업 추가..."
          value={newItemTitle}
        />
        <Pressable
          accessibilityLabel="하위 작업 추가"
          className="h-8 justify-center rounded-md bg-secondary px-2.5 disabled:opacity-50"
          disabled={disabled || !newItemTitle.trim()}
          onPress={addItem}
        >
          <Text className="text-xs font-medium">추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChecklistItemRow({
  checklistId,
  disabled,
  index,
  item,
  items,
  onMoveItem,
  onRemoveItem,
  onUpdateItem,
}: {
  checklistId: string;
  disabled: boolean;
  index: number;
  item: TicketChecklist['items'][number];
  items: readonly TicketChecklist['items'][number][];
  onMoveItem: (
    checklistId: string,
    itemId: string,
    data: MoveTicketChecklistItem,
  ) => void;
  onRemoveItem: (checklistId: string, itemId: string) => void;
  onUpdateItem: (
    checklistId: string,
    itemId: string,
    data: UpdateTicketChecklistItem,
    callbacks?: MutationCallbacks,
  ) => void;
}) {
  const [title, setTitle] = useState(item.title);
  useEffect(() => setTitle(item.title), [item.title]);

  return (
    <View className="flex-row items-center gap-1.5 rounded-md px-1 py-0.5 web:hover:bg-muted/50">
      <Pressable
        accessibilityLabel={
          item.completed ? '하위 작업 완료 해제' : '하위 작업 완료'
        }
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.completed, disabled }}
        className={cn(
          'size-4 items-center justify-center rounded border',
          item.completed
            ? 'border-foreground bg-foreground'
            : 'border-muted-foreground/40',
        )}
        disabled={disabled}
        onPress={() =>
          onUpdateItem(checklistId, item.id, { completed: !item.completed })
        }
      >
        {item.completed ? (
          <Icon as={Check} className="size-3 text-background" />
        ) : null}
      </Pressable>

      <Input
        accessibilityLabel="하위 작업 이름"
        className={cn(
          'h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs',
          item.completed && 'text-muted-foreground line-through',
        )}
        editable={!disabled}
        onBlur={() => {
          const next = title.trim();
          if (!next) {
            setTitle(item.title);
            return;
          }
          if (next !== item.title) {
            onUpdateItem(
              checklistId,
              item.id,
              { title: next },
              { onError: () => setTitle(item.title) },
            );
          }
        }}
        onChangeText={setTitle}
        value={title}
      />

      <Pressable
        accessibilityLabel="하위 작업 위로 이동"
        disabled={disabled || index === 0}
        onPress={() => {
          const previous = items[index - 1];
          if (previous)
            onMoveItem(checklistId, item.id, { beforeItemId: previous.id });
        }}
      >
        <Icon as={ChevronUp} className="size-3 text-muted-foreground" />
      </Pressable>
      <Pressable
        accessibilityLabel="하위 작업 아래로 이동"
        disabled={disabled || index === items.length - 1}
        onPress={() => {
          const next = items[index + 1];
          if (next) onMoveItem(checklistId, item.id, { afterItemId: next.id });
        }}
      >
        <Icon as={ChevronDown} className="size-3 text-muted-foreground" />
      </Pressable>
      <Pressable
        accessibilityLabel="하위 작업 삭제"
        disabled={disabled}
        onPress={() => onRemoveItem(checklistId, item.id)}
      >
        <Icon as={Trash2} className="size-3 text-muted-foreground" />
      </Pressable>
    </View>
  );
}
