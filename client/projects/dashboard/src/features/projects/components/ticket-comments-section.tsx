import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type {
  CreateTicketComment,
  TicketComment,
  UpdateTicketComment,
} from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { TicketMarkdownEditor } from '@core/features/projects/components/ticket-markdown-editor';

import { Pencil, Trash2 } from 'lucide-react-native';

export function TicketCommentsSection({
  comments,
  currentUserId,
  disabled,
  onCreateComment,
  onRemoveComment,
  onUpdateComment,
}: {
  comments: readonly TicketComment[];
  currentUserId: string | null;
  disabled: boolean;
  onCreateComment: (data: CreateTicketComment, onSuccess?: () => void) => void;
  onRemoveComment: (commentId: string) => void;
  onUpdateComment: (
    commentId: string,
    data: UpdateTicketComment,
    onSuccess?: () => void,
  ) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const sortedComments = [...comments].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime() || left.id.localeCompare(right.id),
  );

  const submit = () => {
    if (!draft.trim()) return;
    onCreateComment({ contentMarkdown: draft }, () => setDraft(''));
  };

  return (
    <View className="gap-3 border-t border-border pt-4">
      <Text className="text-xs font-semibold text-muted-foreground">
        활동 및 코멘트
      </Text>

      {sortedComments.length === 0 ? (
        <Text className="py-1 text-xs text-muted-foreground">
          아직 댓글이 없습니다.
        </Text>
      ) : (
        <View className="gap-2">
          {sortedComments.map((comment) => {
            const own = currentUserId === comment.author.userId;
            const editing = editingCommentId === comment.id;
            return (
              <View
                className="flex-row items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 p-2.5"
                key={comment.id}
              >
                <Avatar
                  alt={`${comment.author.name} 아바타`}
                  className="size-6"
                >
                  {comment.author.image ? (
                    <AvatarImage source={{ uri: comment.author.image }} />
                  ) : null}
                  <AvatarFallback>
                    <Text className="text-2xs font-bold">
                      {comment.author.name.charAt(0).toUpperCase()}
                    </Text>
                  </AvatarFallback>
                </Avatar>

                <View className="min-w-0 flex-1 gap-1.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      <Text className="truncate text-xs font-semibold">
                        {comment.author.name}
                      </Text>
                      <Text className="text-2xs text-muted-foreground">
                        {formatCommentTime(comment.createdAt)}
                      </Text>
                    </View>
                    {own ? (
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          accessibilityLabel="댓글 편집"
                          disabled={disabled}
                          onPress={() => {
                            setEditingCommentId(comment.id);
                            setEditDraft(comment.contentMarkdown);
                          }}
                        >
                          <Icon
                            as={Pencil}
                            className="size-3 text-muted-foreground"
                          />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="댓글 삭제"
                          disabled={disabled}
                          onPress={() => onRemoveComment(comment.id)}
                        >
                          <Icon
                            as={Trash2}
                            className="size-3 text-muted-foreground"
                          />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>

                  {editing ? (
                    <View className="gap-2">
                      <TicketMarkdownEditor
                        compact
                        editable={!disabled}
                        onChangeText={setEditDraft}
                        placeholder="댓글을 입력하세요..."
                        value={editDraft}
                      />
                      <View className="flex-row justify-end gap-2">
                        <Button
                          disabled={disabled}
                          onPress={() => setEditingCommentId(null)}
                          size="sm"
                          variant="ghost"
                        >
                          <Text className="text-xs">취소</Text>
                        </Button>
                        <Button
                          disabled={disabled || !editDraft.trim()}
                          onPress={() => {
                            if (!editDraft.trim()) return;
                            onUpdateComment(
                              comment.id,
                              { contentMarkdown: editDraft },
                              () => setEditingCommentId(null),
                            );
                          }}
                          size="sm"
                        >
                          <Text className="text-xs text-primary-foreground">
                            저장
                          </Text>
                        </Button>
                      </View>
                    </View>
                  ) : (
                    <TicketMarkdownEditor
                      bare
                      compact
                      editable={false}
                      onChangeText={() => undefined}
                      placeholder=""
                      value={comment.contentMarkdown}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View className="gap-2 pt-1">
        <TicketMarkdownEditor
          compact
          editable={!disabled}
          onChangeText={setDraft}
          placeholder="댓글을 입력하세요..."
          value={draft}
        />
        <View className="flex-row justify-end">
          <Button
            disabled={disabled || !draft.trim()}
            onPress={submit}
            size="sm"
          >
            <Text className="text-xs text-primary-foreground">등록</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}

function formatCommentTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
