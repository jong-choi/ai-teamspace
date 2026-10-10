// class를 받지 못하는 곳(SVG, 마크다운 스타일)이 쓰는 현재 테마의 색 값이다.
// 값은 바로 쓸 수 있는 CSS 색 문자열이다.
export const APPEARANCE_TOKEN_VARIABLES = {
  background: '--background',
  border: '--border',
  foreground: '--foreground',
  input: '--input',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  primary: '--primary',
  ring: '--ring',
} as const;

export type AppearanceTokens = Record<
  keyof typeof APPEARANCE_TOKEN_VARIABLES,
  string
>;
