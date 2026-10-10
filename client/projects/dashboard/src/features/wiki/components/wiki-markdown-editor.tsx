import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  type TextInputSelectionChangeEventData,
  View,
} from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { scaleMarkdownFont } from '@core/app/markdown/product-markdown-theme';
import type { WikiCollaborator } from '@core/features/wiki/collaboration/wiki-awareness';
import {
  useWikiCollaborationPlatform,
  type WikiEditorSelectionGeometry,
} from '@core/features/wiki/collaboration/wiki-collaboration-platform';
import {
  type MarkdownStyle,
  MarkdownTextInput,
  type MarkdownTextInputHandle,
} from '@core/features/wiki/wiki-live-markdown';
import { parseWikiMarkdown } from '@core/features/wiki/wiki-markdown-parser';
import {
  useWikiMarkdownPalette,
  type WikiMarkdownPalette,
} from '@core/features/wiki/wiki-markdown-theme';

type WikiMarkdownEditorProps = {
  collaborators?: readonly WikiCollaborator[];
  compact?: boolean;
  editable: boolean;
  onChangeText: (value: string) => void;
  onCompositionEnd?: () => void;
  onCompositionStart?: () => void;
  onSelectionChange?: (selection: { start: number; end: number }) => void;
  value: string;
};

type WikiRemoteCursorGeometry = {
  collaborator: WikiCollaborator;
  geometry: WikiEditorSelectionGeometry;
};

const emptyCollaborators: readonly WikiCollaborator[] = [];

export function WikiMarkdownEditor({
  collaborators = emptyCollaborators,
  compact = false,
  editable,
  onChangeText,
  onCompositionEnd,
  onCompositionStart,
  onSelectionChange,
  value,
}: WikiMarkdownEditorProps) {
  const platform = useWikiCollaborationPlatform();
  const inputRef = useRef<MarkdownTextInputHandle | null>(null);
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [remoteCursors, setRemoteCursors] = useState<
    WikiRemoteCursorGeometry[]
  >([]);
  const palette = useWikiMarkdownPalette();
  const inputStyle = useMemo(() => createInputStyle(palette), [palette]);
  const markdownStyle = useMemo(() => createMarkdownStyle(palette), [palette]);

  useEffect(() => {
    const handle = inputRef.current;
    if (!handle || !onCompositionStart || !onCompositionEnd) return;
    return platform.bindEditorComposition(handle, {
      onCompositionStart,
      onCompositionEnd,
    });
  }, [onCompositionEnd, onCompositionStart, platform]);

  useEffect(() => {
    const handle = inputRef.current;
    if (!handle) return;
    return platform.bindEditorGeometryInvalidation(handle, () =>
      setGeometryRevision((revision) => revision + 1),
    );
  }, [platform]);

  useLayoutEffect(() => {
    const handle = inputRef.current;
    if (!handle) {
      setRemoteCursors([]);
      return;
    }
    setRemoteCursors(
      collaborators.flatMap((collaborator) => {
        if (!collaborator.selection) return [];
        const geometry = platform.measureEditorSelection(
          handle,
          collaborator.selection,
        );
        return geometry ? [{ collaborator, geometry }] : [];
      }),
    );
  }, [collaborators, geometryRevision, platform, value]);

  return (
    <View
      className={
        compact
          ? 'min-h-0 flex-1 p-6'
          : 'min-h-0 w-full max-w-4xl flex-1 self-center p-6'
      }
    >
      <View
        className="relative min-h-0 flex-1"
        onLayout={() => setGeometryRevision((revision) => revision + 1)}
      >
        <MarkdownTextInput
          accessibilityLabel="위키 Markdown 편집기"
          editable={editable}
          markdownStyle={markdownStyle}
          multiline
          onChangeText={onChangeText}
          onSelectionChange={(
            event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
          ) => onSelectionChange?.(event.nativeEvent.selection)}
          parser={parseWikiMarkdown}
          placeholder="마크다운 내용을 작성하세요..."
          placeholderTextColor={palette.placeholder}
          ref={inputRef}
          scrollEnabled
          style={inputStyle}
          textAlignVertical="top"
          value={value}
        />
        <WikiRemoteCursorOverlay cursors={remoteCursors} />
      </View>
    </View>
  );
}

function WikiRemoteCursorOverlay({
  cursors,
}: {
  cursors: readonly WikiRemoteCursorGeometry[];
}) {
  if (cursors.length === 0) return null;

  return (
    <View className="absolute inset-0" pointerEvents="none">
      {cursors.map(({ collaborator, geometry }) => (
        <View className="absolute inset-0" key={collaborator.userId}>
          {geometry.selectionRects.map((rect, index) => (
            <View
              className="absolute"
              key={`${collaborator.userId}:selection:${index}`}
              style={{
                backgroundColor: collaborator.color,
                height: Math.max(rect.height, 1),
                left: rect.x,
                opacity: 0.18,
                top: rect.y,
                width: Math.max(rect.width, 2),
              }}
            />
          ))}
          <View
            className="absolute"
            style={{
              backgroundColor: collaborator.color,
              height: Math.max(geometry.caret.height, 16),
              left: geometry.caret.x,
              top: geometry.caret.y,
              width: 2,
            }}
          />
          <View
            className="absolute rounded-sm px-1 py-0.5"
            style={{
              backgroundColor: collaborator.color,
              left: geometry.caret.x,
              top: Math.max(0, geometry.caret.y - 18),
            }}
          >
            <Text className="text-3xs font-medium text-white" numberOfLines={1}>
              {collaborator.name}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function createInputStyle(palette: WikiMarkdownPalette) {
  return StyleSheet.create({
    input: {
      flex: 1,
      width: '100%',
      minHeight: 160,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
      borderRadius: 12,
      backgroundColor: 'transparent',
      color: palette.foreground,
      fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
      fontSize: scaleMarkdownFont(palette, 12),
      lineHeight: scaleMarkdownFont(palette, 20),
    },
  }).input;
}

function createMarkdownStyle(palette: WikiMarkdownPalette): MarkdownStyle {
  return {
    syntax: { color: palette.placeholder },
    link: { color: palette.link },
    h1: { fontSize: scaleMarkdownFont(palette, 20) },
    blockquote: {
      borderColor: palette.strongBorder,
      borderWidth: 2,
      marginLeft: 2,
      paddingLeft: 10,
    },
    code: {
      color: palette.foreground,
      backgroundColor: palette.surface,
      borderColor: palette.strongBorder,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 4,
      fontFamily:
        Platform.select({ ios: 'Courier', default: 'monospace' }) ??
        'monospace',
      fontSize: scaleMarkdownFont(palette, 12),
      paddingHorizontal: 3,
    },
    pre: {
      color: palette.foreground,
      backgroundColor: palette.surface,
      borderColor: palette.strongBorder,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      fontFamily:
        Platform.select({ ios: 'Courier', default: 'monospace' }) ??
        'monospace',
      fontSize: scaleMarkdownFont(palette, 12),
      padding: 12,
    },
  };
}
