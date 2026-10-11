import { z } from 'zod';

/**
 * 본문의 한 구간을 다른 문구로 바꾸는 부분 수정 요청이다.
 */
export const WikiContentEditSchema = z
  .object({
    startLine: z
      .int()
      .min(1)
      .describe('oldText의 첫 글자가 놓인 행 번호(1부터).'),
    oldText: z
      .string()
      .min(1)
      .describe('바꿀 기존 문구. 현재 본문과 글자 그대로 일치해야 합니다.'),
    newText: z
      .string()
      .describe('oldText 자리에 들어갈 문구. 빈 문자열이면 삭제합니다.'),
  })
  .refine(
    (edit) => edit.oldText !== edit.newText,
    'oldText와 newText가 같아 수정할 내용이 없습니다.',
  )
  .meta({ id: 'WikiContentEdit' });

export type WikiContentEdit = z.infer<typeof WikiContentEditSchema>;

/**
 * Y.Text index(UTF-16 code unit) 기준으로 지우고 넣을 최소 구간이다.
 */
export type WikiTextPatch = {
  index: number;
  deleteCount: number;
  insertText: string;
};

export type WikiContentEditLocation =
  | { kind: 'located'; index: number }
  | {
      kind: 'ambiguous';
      // oldText가 시작하는 행 번호를 오름차순으로 중복 없이 담는다.
      startLines: number[];
      // 지정한 startLine 안에서 oldText가 두 번 이상 시작하는 경우다.
      repeatedOnStartLine: boolean;
    }
  | { kind: 'not_found' };

/**
 * startLine과 oldText로 수정할 위치를 하나로 정한다.
 * startLine이 틀려도 oldText가 본문에 한 곳뿐이면 그 위치를 쓴다.
 */
export function locateWikiContentEdit(
  contentMarkdown: string,
  edit: Pick<WikiContentEdit, 'startLine' | 'oldText'>,
): WikiContentEditLocation {
  const occurrences = findOccurrences(contentMarkdown, edit.oldText);
  if (occurrences.length === 0) {
    return { kind: 'not_found' };
  }

  const onStartLine = occurrences.filter(
    (occurrence) => occurrence.line === edit.startLine,
  );
  const [onlyOnStartLine] = onStartLine;
  if (onStartLine.length === 1 && onlyOnStartLine) {
    return { kind: 'located', index: onlyOnStartLine.index };
  }

  const [onlyOccurrence] = occurrences;
  if (occurrences.length === 1 && onlyOccurrence) {
    return { kind: 'located', index: onlyOccurrence.index };
  }

  return {
    kind: 'ambiguous',
    startLines: [...new Set(occurrences.map((occurrence) => occurrence.line))],
    repeatedOnStartLine: onStartLine.length > 1,
  };
}

/**
 * oldText와 newText에서 실제로 달라진 구간만 남긴 patch를 만든다.
 * surrogate pair를 쪼개지 않도록 code point 단위로 비교한다.
 */
export function createWikiContentEditPatch(
  index: number,
  edit: Pick<WikiContentEdit, 'oldText' | 'newText'>,
): WikiTextPatch {
  const oldCodePoints = Array.from(edit.oldText);
  const newCodePoints = Array.from(edit.newText);

  let prefixLength = 0;
  const maximumPrefixLength = Math.min(
    oldCodePoints.length,
    newCodePoints.length,
  );
  while (
    prefixLength < maximumPrefixLength &&
    oldCodePoints[prefixLength] === newCodePoints[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const maximumSuffixLength = maximumPrefixLength - prefixLength;
  while (
    suffixLength < maximumSuffixLength &&
    oldCodePoints[oldCodePoints.length - 1 - suffixLength] ===
      newCodePoints[newCodePoints.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    index: index + oldCodePoints.slice(0, prefixLength).join('').length,
    deleteCount: oldCodePoints
      .slice(prefixLength, oldCodePoints.length - suffixLength)
      .join('').length,
    insertText: newCodePoints
      .slice(prefixLength, newCodePoints.length - suffixLength)
      .join(''),
  };
}

function findOccurrences(
  contentMarkdown: string,
  oldText: string,
): Array<{ index: number; line: number }> {
  const occurrences: Array<{ index: number; line: number }> = [];
  let line = 1;
  let scanned = 0;
  let index = contentMarkdown.indexOf(oldText);
  while (index >= 0) {
    line += countLineBreaks(contentMarkdown, scanned, index);
    scanned = index;
    occurrences.push({ index, line });
    index = contentMarkdown.indexOf(oldText, index + 1);
  }
  return occurrences;
}

function countLineBreaks(text: string, from: number, to: number): number {
  let count = 0;
  let position = text.indexOf('\n', from);
  while (position >= 0 && position < to) {
    count += 1;
    position = text.indexOf('\n', position + 1);
  }
  return count;
}
