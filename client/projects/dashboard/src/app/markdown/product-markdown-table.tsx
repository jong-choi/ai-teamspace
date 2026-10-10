import { ScrollView, View } from 'react-native';
import type { RenderRules } from 'react-native-markdown-display';

// 표의 칼럼이 이 너비보다 좁아지면 줄이는 대신 표 전체를 좌우로 스크롤한다.
export const PRODUCT_MARKDOWN_TABLE_CELL_MIN_WIDTH = 40;

// 읽기 전용 렌더러의 표 rule이다. 칼럼이 적으면 본문 폭을 채우고, 많으면 좌우 스크롤된다.
export const productMarkdownTableRules: RenderRules = {
  table: (node, children, _parent, styles) => (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      horizontal
      key={node.key}
    >
      <View style={[styles._VIEW_SAFE_table, { flexGrow: 1 }]}>{children}</View>
    </ScrollView>
  ),
};
