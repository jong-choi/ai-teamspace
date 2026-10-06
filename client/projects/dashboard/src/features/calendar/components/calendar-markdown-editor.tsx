import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';

import {
  type MarkdownStyle,
  MarkdownTextInput,
} from '@core/app/markdown/live-markdown';
import { parseProductMarkdown } from '@core/app/markdown/product-markdown-parser';
import {
  getProductMarkdownPalette,
  type ProductMarkdownPalette,
} from '@core/app/markdown/product-markdown-theme';

import { useColorScheme } from 'nativewind';

export function CalendarMarkdownEditor({
  accessibilityLabel = '회의 안건 Markdown 편집기',
  editable = true,
  onChangeText,
  placeholder,
  value,
}: {
  accessibilityLabel?: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colorScheme } = useColorScheme();
  const palette = useMemo(
    () => getProductMarkdownPalette(colorScheme === 'dark'),
    [colorScheme],
  );
  const inputStyle = useMemo(() => createInputStyle(palette), [palette]);
  const markdownStyle = useMemo(() => createMarkdownStyle(palette), [palette]);

  return (
    <MarkdownTextInput
      accessibilityLabel={accessibilityLabel}
      editable={editable}
      markdownStyle={markdownStyle}
      multiline
      onChangeText={onChangeText}
      parser={parseProductMarkdown}
      placeholder={placeholder}
      placeholderTextColor={palette.placeholder}
      style={inputStyle}
      textAlignVertical="top"
      value={value}
    />
  );
}

function createInputStyle(palette: ProductMarkdownPalette) {
  return StyleSheet.create({
    input: {
      minHeight: 112,
      width: '100%',
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.border,
      borderRadius: 8,
      backgroundColor: 'transparent',
      color: palette.foreground,
      fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
      fontSize: 12,
      lineHeight: 18,
    },
  }).input;
}

function createMarkdownStyle(palette: ProductMarkdownPalette): MarkdownStyle {
  return {
    syntax: { color: palette.placeholder },
    link: { color: palette.link },
    h1: { fontSize: 16 },
    blockquote: {
      borderColor: palette.strongBorder,
      borderWidth: 2,
      marginLeft: 2,
      paddingLeft: 8,
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
      fontSize: 11,
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
      fontSize: 11,
      padding: 10,
    },
  };
}
