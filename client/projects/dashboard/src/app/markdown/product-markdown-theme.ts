export type ProductMarkdownPalette = {
  border: string;
  foreground: string;
  link: string;
  muted: string;
  placeholder: string;
  strongBorder: string;
  surface: string;
};

export function getProductMarkdownPalette(
  dark: boolean,
): ProductMarkdownPalette {
  return dark
    ? {
        border: '#27272a',
        foreground: '#f4f4f5',
        link: '#d4d4d8',
        muted: '#a1a1aa',
        placeholder: '#71717a',
        strongBorder: '#3f3f46',
        surface: '#18181b',
      }
    : {
        border: '#e4e4e7',
        foreground: '#18181b',
        link: '#3f3f46',
        muted: '#71717a',
        placeholder: '#a1a1aa',
        strongBorder: '#d4d4d8',
        surface: '#f4f4f5',
      };
}

// 읽기 전용 렌더러의 inline code 스타일이다. react-native-markdown-display 기본값의
// padding 10과 테두리를 지워 줄 높이를 넘지 않는 옅은 배경 칩으로 보이게 한다.
export function getProductInlineCodeStyle(palette: ProductMarkdownPalette) {
  return {
    backgroundColor: palette.surface,
    borderRadius: 4,
    borderWidth: 0,
    color: palette.foreground,
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
  } as const;
}
