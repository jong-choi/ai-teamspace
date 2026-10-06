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
