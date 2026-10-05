const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]/g;
const CONTROL_CHARACTERS = /\p{Cc}/gu;

export function createWikiMarkdownFileName(title: string): string {
  const normalized = title
    .trim()
    .replace(INVALID_FILE_NAME_CHARACTERS, '-')
    .replace(CONTROL_CHARACTERS, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  const baseName = normalized || 'wiki-document';
  return baseName.toLowerCase().endsWith('.md') ? baseName : `${baseName}.md`;
}
