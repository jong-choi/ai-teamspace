import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

import {
  PRODUCT_MARKDOWN_TABLE_CELL_MIN_WIDTH,
  productMarkdownTableRules,
} from '@core/app/markdown/product-markdown-table';
import {
  getProductInlineCodeStyle,
  type ProductMarkdownPalette,
  scaleMarkdownFont,
  useProductMarkdownPalette,
} from '@core/app/markdown/product-markdown-theme';

// 좁은 채팅 패널에 맞춘 작은 글자 크기의 마크다운이다. 색은 위키와 같은 제품 palette를 쓴다.
export function AgentMarkdown({ content }: { content: string }) {
  const palette = useProductMarkdownPalette();
  const styles = useMemo(() => createAgentMarkdownStyles(palette), [palette]);

  return (
    <Markdown rules={productMarkdownTableRules} style={styles}>
      {content}
    </Markdown>
  );
}

function createAgentMarkdownStyles(palette: ProductMarkdownPalette) {
  const { border, foreground, link, muted, surface } = palette;

  return StyleSheet.create({
    body: {
      color: foreground,
      fontSize: scaleMarkdownFont(palette, 13),
      lineHeight: scaleMarkdownFont(palette, 21),
    },
    heading1: {
      color: foreground,
      fontSize: scaleMarkdownFont(palette, 17),
      fontWeight: '700',
      marginBottom: 8,
      marginTop: 6,
    },
    heading2: {
      color: foreground,
      fontSize: scaleMarkdownFont(palette, 15),
      fontWeight: '700',
      marginBottom: 6,
      marginTop: 10,
    },
    heading3: {
      color: foreground,
      fontSize: scaleMarkdownFont(palette, 14),
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
      fontSize: scaleMarkdownFont(palette, 12),
      padding: 10,
    },
    fence: {
      backgroundColor: surface,
      borderColor: border,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      color: foreground,
      fontFamily: 'monospace',
      fontSize: scaleMarkdownFont(palette, 12),
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
