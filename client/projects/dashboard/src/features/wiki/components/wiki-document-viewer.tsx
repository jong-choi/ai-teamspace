import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

import type { WikiDocument } from '@repo/client/api-client/schemas';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  PRODUCT_MARKDOWN_TABLE_CELL_MIN_WIDTH,
  productMarkdownTableRules,
} from '@core/app/markdown/product-markdown-table';
import {
  getProductInlineCodeStyle,
  scaleMarkdownFont,
} from '@core/app/markdown/product-markdown-theme';
import {
  useWikiMarkdownPalette,
  type WikiMarkdownPalette,
} from '@core/features/wiki/wiki-markdown-theme';

export function WikiDocumentViewer({ document }: { document: WikiDocument }) {
  return <WikiMarkdownViewer contentMarkdown={document.contentMarkdown} />;
}

export function WikiMarkdownViewer({
  contentMarkdown,
  compact = false,
}: {
  contentMarkdown: string;
  compact?: boolean;
}) {
  return (
    <ScrollView
      className="min-h-0 flex-1 bg-background"
      contentContainerClassName={
        compact ? 'w-full self-center p-6' : 'w-full max-w-4xl self-center p-8'
      }
      showsVerticalScrollIndicator={false}
    >
      <WikiMarkdownContent contentMarkdown={contentMarkdown} />
    </ScrollView>
  );
}

export function WikiMarkdownContent({
  contentMarkdown,
}: {
  contentMarkdown: string;
}) {
  const palette = useWikiMarkdownPalette();
  const markdownStyles = useMemo(
    () => createMarkdownStyles(palette),
    [palette],
  );

  if (!contentMarkdown.trim()) {
    return (
      <View className="rounded-lg border border-dashed border-border px-5 py-8">
        <Text className="text-center text-xs leading-5 text-muted-foreground">
          아직 내용이 없는 문서입니다.
        </Text>
      </View>
    );
  }

  return (
    <Markdown rules={productMarkdownTableRules} style={markdownStyles}>
      {contentMarkdown}
    </Markdown>
  );
}

function createMarkdownStyles(palette: WikiMarkdownPalette) {
  const { border, foreground, link, muted, surface } = palette;

  return StyleSheet.create({
    body: {
      color: foreground,
      fontSize: scaleMarkdownFont(palette, 13),
      lineHeight: scaleMarkdownFont(palette, 22),
    },
    heading1: {
      color: foreground,
      fontSize: scaleMarkdownFont(palette, 24),
      fontWeight: '700',
      lineHeight: scaleMarkdownFont(palette, 32),
      marginBottom: 14,
      marginTop: 10,
    },
    heading2: {
      color: foreground,
      fontSize: scaleMarkdownFont(palette, 19),
      fontWeight: '700',
      lineHeight: scaleMarkdownFont(palette, 28),
      marginBottom: 10,
      marginTop: 24,
    },
    heading3: {
      color: foreground,
      fontSize: scaleMarkdownFont(palette, 16),
      fontWeight: '600',
      lineHeight: scaleMarkdownFont(palette, 24),
      marginBottom: 8,
      marginTop: 20,
    },
    paragraph: {
      color: foreground,
      marginBottom: 12,
      marginTop: 0,
    },
    strong: {
      color: foreground,
      fontWeight: '700',
    },
    em: {
      color: foreground,
    },
    link: {
      color: link,
      textDecorationLine: 'underline',
    },
    bullet_list: {
      marginBottom: 12,
    },
    ordered_list: {
      marginBottom: 12,
    },
    list_item: {
      marginBottom: 3,
    },
    blockquote: {
      backgroundColor: 'transparent',
      borderColor: border,
      borderLeftWidth: 3,
      color: muted,
      marginBottom: 14,
      paddingLeft: 14,
    },
    code_inline: getProductInlineCodeStyle(palette),
    code_block: {
      backgroundColor: surface,
      borderColor: border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: foreground,
      fontFamily: 'monospace',
      fontSize: scaleMarkdownFont(palette, 12),
      lineHeight: scaleMarkdownFont(palette, 19),
      marginBottom: 16,
      padding: 14,
    },
    fence: {
      backgroundColor: surface,
      borderColor: border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      color: foreground,
      fontFamily: 'monospace',
      fontSize: scaleMarkdownFont(palette, 12),
      lineHeight: scaleMarkdownFont(palette, 19),
      marginBottom: 16,
      padding: 14,
    },
    hr: {
      backgroundColor: border,
      height: StyleSheet.hairlineWidth,
      marginBottom: 20,
      marginTop: 20,
    },
    table: {
      borderColor: border,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 16,
    },
    tr: {
      borderBottomColor: border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
    },
    th: {
      color: foreground,
      fontWeight: '600',
      minWidth: PRODUCT_MARKDOWN_TABLE_CELL_MIN_WIDTH,
      padding: 8,
    },
    td: {
      color: foreground,
      minWidth: PRODUCT_MARKDOWN_TABLE_CELL_MIN_WIDTH,
      padding: 8,
    },
  });
}
