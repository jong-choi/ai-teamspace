import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

import {
  PRODUCT_MARKDOWN_TABLE_CELL_MIN_WIDTH,
  productMarkdownTableRules,
} from '@core/app/markdown/product-markdown-table';
import {
  getProductInlineCodeStyle,
  getProductMarkdownPalette,
} from '@core/app/markdown/product-markdown-theme';

import { useColorScheme } from 'nativewind';

// 좁은 채팅 패널에 맞춘 작은 글자 크기의 마크다운이다. 색은 위키와 같은 제품 palette를 쓴다.
export function AgentMarkdown({ content }: { content: string }) {
  const { colorScheme } = useColorScheme();
  const styles = useMemo(
    () => createAgentMarkdownStyles(colorScheme === 'dark'),
    [colorScheme],
  );

  return (
    <Markdown rules={productMarkdownTableRules} style={styles}>
      {content}
    </Markdown>
  );
}

function createAgentMarkdownStyles(dark: boolean) {
  const palette = getProductMarkdownPalette(dark);
  const { border, foreground, link, muted, surface } = palette;

  return StyleSheet.create({
    body: { color: foreground, fontSize: 13, lineHeight: 21 },
    heading1: {
      color: foreground,
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 8,
      marginTop: 6,
    },
    heading2: {
      color: foreground,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 6,
      marginTop: 10,
    },
    heading3: {
      color: foreground,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
      marginTop: 8,
    },
    paragraph: { color: foreground, marginBottom: 6, marginTop: 0 },
    strong: { color: foreground, fontWeight: '700' },
    em: { color: foreground },
    link: { color: link, textDecorationLine: 'underline' },
    bullet_list: { marginBottom: 6 },
    ordered_list: { marginBottom: 6 },
    list_item: { marginBottom: 2 },
    blockquote: {
      backgroundColor: 'transparent',
      borderColor: border,
      borderLeftWidth: 3,
      color: muted,
      marginBottom: 8,
      paddingLeft: 10,
    },
    code_inline: getProductInlineCodeStyle(palette),
    code_block: {
      backgroundColor: surface,
      borderColor: border,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      color: foreground,
      fontFamily: 'monospace',
      fontSize: 12,
      padding: 10,
    },
    fence: {
      backgroundColor: surface,
      borderColor: border,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      color: foreground,
      fontFamily: 'monospace',
      fontSize: 12,
      padding: 10,
    },
    table: {
      borderColor: border,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 8,
    },
    th: { minWidth: PRODUCT_MARKDOWN_TABLE_CELL_MIN_WIDTH, padding: 6 },
    td: { minWidth: PRODUCT_MARKDOWN_TABLE_CELL_MIN_WIDTH, padding: 6 },
    tr: { borderColor: border },
    hr: { backgroundColor: border, marginVertical: 10 },
  });
}
