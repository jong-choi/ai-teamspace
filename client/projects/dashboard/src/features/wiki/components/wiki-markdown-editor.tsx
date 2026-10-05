import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  type MarkdownStyle,
  MarkdownTextInput,
} from '@core/features/wiki/wiki-live-markdown';
import { parseWikiMarkdown } from '@core/features/wiki/wiki-markdown-parser';
import {
  getWikiMarkdownPalette,
  type WikiMarkdownPalette,
} from '@core/features/wiki/wiki-markdown-theme';

import { useColorScheme } from 'nativewind';

type WikiMarkdownEditorProps = {
  compact?: boolean;
  editable: boolean;
  onChangeText: (value: string) => void;
  value: string;
};

export function WikiMarkdownEditor({
  compact = false,
  editable,
  onChangeText,
  value,
}: WikiMarkdownEditorProps) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const palette = useMemo(() => getWikiMarkdownPalette(dark), [dark]);
  const inputStyle = useMemo(() => createInputStyle(palette), [palette]);
  const markdownStyle = useMemo(() => createMarkdownStyle(palette), [palette]);

  return (
    <View
      className={
        compact
          ? 'min-h-0 flex-1 p-6'
          : 'min-h-0 w-full max-w-4xl flex-1 self-center p-6'
      }
    >
      <MarkdownTextInput
        accessibilityLabel="위키 Markdown 편집기"
        editable={editable}
        markdownStyle={markdownStyle}
        multiline
        onChangeText={onChangeText}
        parser={parseWikiMarkdown}
        placeholder="마크다운 내용을 작성하세요..."
        placeholderTextColor={palette.placeholder}
        scrollEnabled
        style={inputStyle}
        textAlignVertical="top"
        value={value}
      />
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
      fontSize: 12,
      lineHeight: 20,
    },
  }).input;
}

function createMarkdownStyle(palette: WikiMarkdownPalette): MarkdownStyle {
  return {
    syntax: { color: palette.placeholder },
    link: { color: palette.link },
    h1: { fontSize: 20 },
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
      fontSize: 12,
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
      fontSize: 12,
      padding: 12,
    },
  };
}
