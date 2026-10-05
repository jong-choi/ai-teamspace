import type { MarkdownRange } from '@core/features/wiki/wiki-live-markdown';

const MAX_MARKDOWN_PARSE_LENGTH = 100_000;

export function parseWikiMarkdown(input: string): MarkdownRange[] {
  'worklet';

  if (input.length > MAX_MARKDOWN_PARSE_LENGTH) return [];

  const ranges: MarkdownRange[] = [];
  let match: RegExpExecArray | null;

  const heading = /^(#{1,6})(\s+)(.+)$/gm;
  while ((match = heading.exec(input)) !== null) {
    const marker = match[1];
    const spacing = match[2];
    const content = match[3];
    if (!marker || !spacing || !content) continue;
    ranges.push({ type: 'syntax', start: match.index, length: marker.length });
    ranges.push({
      type: 'h1',
      start: match.index + marker.length + spacing.length,
      length: content.length,
    });
  }

  const blockquote = /^(>)(\s?)(.+)$/gm;
  while ((match = blockquote.exec(input)) !== null) {
    const marker = match[1];
    const spacing = match[2] ?? '';
    const content = match[3];
    if (!marker || !content) continue;
    ranges.push({ type: 'syntax', start: match.index, length: marker.length });
    ranges.push({
      type: 'blockquote',
      start: match.index + marker.length + spacing.length,
      length: content.length,
    });
  }

  const fencedCode = /```[^\n]*\n([\s\S]*?)```/g;
  while ((match = fencedCode.exec(input)) !== null) {
    const body = match[1] ?? '';
    const openingLength = match[0].indexOf('\n') + 1;
    ranges.push({ type: 'syntax', start: match.index, length: openingLength });
    ranges.push({
      type: 'pre',
      start: match.index + openingLength,
      length: body.length,
    });
    ranges.push({
      type: 'syntax',
      start: match.index + openingLength + body.length,
      length: 3,
    });
  }

  const inlineCode = /(`)([^`\n]+)(`)/g;
  while ((match = inlineCode.exec(input)) !== null) {
    const content = match[2];
    if (!content) continue;
    ranges.push({ type: 'syntax', start: match.index, length: 1 });
    ranges.push({
      type: 'code',
      start: match.index + 1,
      length: content.length,
    });
    ranges.push({
      type: 'syntax',
      start: match.index + 1 + content.length,
      length: 1,
    });
  }

  const bold = /(\*\*|__)([^\n]+?)\1/g;
  while ((match = bold.exec(input)) !== null) {
    const marker = match[1];
    const content = match[2];
    if (!marker || !content) continue;
    ranges.push({ type: 'syntax', start: match.index, length: marker.length });
    ranges.push({
      type: 'bold',
      start: match.index + marker.length,
      length: content.length,
    });
    ranges.push({
      type: 'syntax',
      start: match.index + marker.length + content.length,
      length: marker.length,
    });
  }

  const italic = /(^|[^*_])(\*|_)([^\n*_]+?)\2(?!\2)/gm;
  while ((match = italic.exec(input)) !== null) {
    const prefix = match[1] ?? '';
    const marker = match[2];
    const content = match[3];
    if (!marker || !content) continue;
    const markerStart = match.index + prefix.length;
    ranges.push({ type: 'syntax', start: markerStart, length: 1 });
    ranges.push({
      type: 'italic',
      start: markerStart + 1,
      length: content.length,
    });
    ranges.push({
      type: 'syntax',
      start: markerStart + 1 + content.length,
      length: 1,
    });
  }

  const strike = /(~~)([^\n]+?)~~/g;
  while ((match = strike.exec(input)) !== null) {
    const content = match[2];
    if (!content) continue;
    ranges.push({ type: 'syntax', start: match.index, length: 2 });
    ranges.push({
      type: 'strikethrough',
      start: match.index + 2,
      length: content.length,
    });
    ranges.push({
      type: 'syntax',
      start: match.index + 2 + content.length,
      length: 2,
    });
  }

  const link = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  while ((match = link.exec(input)) !== null) {
    const label = match[1];
    const href = match[2];
    if (!label || !href) continue;
    ranges.push({ type: 'syntax', start: match.index, length: 1 });
    ranges.push({ type: 'link', start: match.index + 1, length: label.length });
    ranges.push({
      type: 'syntax',
      start: match.index + 1 + label.length,
      length: href.length + 3,
    });
  }

  return ranges;
}
