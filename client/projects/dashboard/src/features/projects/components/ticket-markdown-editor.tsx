import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';

import {
  type MarkdownStyle,
  ProductMarkdownTextInput,
} from '@core/app/markdown/product-live-markdown';
import { parseProductMarkdown } from '@core/app/markdown/product-markdown-parser';
import {
  type ProductMarkdownPalette,
  scaleMarkdownFont,
  useProductMarkdownPalette,
} from '@core/app/markdown/product-markdown-theme';

export function TicketMarkdownEditor({
  bare = false,
  compact = false,
  editable,
  onChangeText,
  placeholder,
  value,
}: {
  bare?: boolean;
  compact?: boolean;
  editable: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const palette = useProductMarkdownPalette();
  const inputStyle = useMemo(
    () => createInputStyle(palette, compact, editable, bare),
    [bare, compact, editable, palette],
  );
  const markdownStyle = useMemo(() => createMarkdownStyle(palette), [palette]);

  return (
    <ProductMarkdownTextInput
      accessibilityLabel={editable ? 'Markdown 편집기' : 'Markdown 내용'}
      editable={editable}
      markdownStyle={markdownStyle}
      multiline
      onChangeText={onChangeText}
      parser={parseProductMarkdown}
      placeholder={placeholder}
      placeholderTextColor={palette.placeholder}
      scrollEnabled
      style={inputStyle}
      textAlignVertical="top"
      value={value}
    />
  );
}

function createInputStyle(
  palette: ProductMarkdownPalette,
  compact: boolean,
  editable: boolean,
  bare: boolean,
) {
  return StyleSheet.create({
    input: {
      minHeight: bare ? 20 : compact ? 56 : 112,
      maxHeight: compact ? 144 : 320,
      width: '100%',
      paddingHorizontal: bare ? 0 : compact ? 10 : 14,
      paddingVertical: bare ? 0 : compact ? 8 : 12,
      borderWidth: bare ? 0 : StyleSheet.hairlineWidth,
      borderColor: palette.border,
      borderRadius: bare ? 0 : compact ? 8 : 12,
      backgroundColor: bare
        ? 'transparent'
        : editable
          ? 'transparent'
          : palette.surface,
      color: palette.foreground,
      fontSize: scaleMarkdownFont(palette, 12),
      lineHeight: scaleMarkdownFont(palette, 20),
    },
  }).input;
}

function createMarkdownStyle(palette: ProductMarkdownPalette): MarkdownStyle {
  return {
    syntax: { color: palette.placeholder },
    link: { color: palette.link },
    h1: { fontSize: scaleMarkdownFont(palette, 16) },
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
      padding: 10,
    },
  };
}
