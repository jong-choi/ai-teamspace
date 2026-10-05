import * as Y from 'yjs';
import { z } from 'zod';

const relativePositionIdSchema = z.object({
  client: z.number().int().nonnegative(),
  clock: z.number().int().nonnegative(),
});

export const WikiRelativePositionSchema = z
  .object({
    type: relativePositionIdSchema.optional(),
    tname: z.string().min(1).optional(),
    item: relativePositionIdSchema.optional(),
    assoc: z.number().int().optional(),
  })
  .refine(
    (position) =>
      position.type !== undefined ||
      position.tname !== undefined ||
      position.item !== undefined,
  );

export const WikiRelativeSelectionSchema = z.object({
  anchor: WikiRelativePositionSchema,
  head: WikiRelativePositionSchema,
});

export type WikiTextSelection = {
  start: number;
  end: number;
};

export type WikiRelativeSelection = z.infer<typeof WikiRelativeSelectionSchema>;

export function createWikiRelativeSelection(
  text: Y.Text,
  selection: WikiTextSelection,
): WikiRelativeSelection {
  const start = clampIndex(selection.start, text.length);
  const end = clampIndex(selection.end, text.length);
  return WikiRelativeSelectionSchema.parse({
    anchor: Y.relativePositionToJSON(
      Y.createRelativePositionFromTypeIndex(text, start),
    ),
    head: Y.relativePositionToJSON(
      Y.createRelativePositionFromTypeIndex(text, end),
    ),
  });
}

export function resolveWikiRelativeSelection(
  document: Y.Doc,
  text: Y.Text,
  selection: unknown,
): WikiTextSelection | null {
  const parsed = WikiRelativeSelectionSchema.safeParse(selection);
  if (!parsed.success) return null;

  const anchor = Y.createAbsolutePositionFromRelativePosition(
    Y.createRelativePositionFromJSON(parsed.data.anchor),
    document,
  );
  const head = Y.createAbsolutePositionFromRelativePosition(
    Y.createRelativePositionFromJSON(parsed.data.head),
    document,
  );
  if (!anchor || !head || anchor.type !== text || head.type !== text) {
    return null;
  }
  return { start: anchor.index, end: head.index };
}

function clampIndex(index: number, maximum: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(maximum, Math.max(0, Math.trunc(index)));
}
