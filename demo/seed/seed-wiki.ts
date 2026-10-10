import { created } from '#seed/api.ts';
import type { SeedContext } from '#seed/context.ts';
import type { Workspace } from '#seed/source.ts';

export async function seedWiki(
  context: SeedContext,
  organizationId: string,
  workspace: Workspace,
): Promise<void> {
  const documentIds = new Map<string, string>();
  const positions = new Map<string, number>();

  // 상위 문서가 먼저 있어야 하므로 파일에 적힌 순서대로 만든다.
  for (const document of workspace.wiki.documents) {
    const parentDocumentId = document.parent
      ? documentIds.get(document.parent)
      : undefined;
    if (document.parent && !parentDocumentId) {
      throw new Error(
        `상위 문서가 먼저 나와야 합니다: ${document.key} → ${document.parent}`,
      );
    }
    const siblingKey = document.parent ?? '';
    const position = positions.get(siblingKey) ?? 0;
    positions.set(siblingKey, position + 1);

    const createdDocument = await context.session(document.author).post(
      `/organizations/${organizationId}/wiki/documents`,
      {
        title: document.title,
        parentDocumentId,
        position,
        contentMarkdown: workspace.wikiMarkdown.get(document.file),
      },
      created,
    );
    documentIds.set(document.key, createdDocument.id);
    context.backdates.push({
      kind: 'wikiDocument',
      id: createdDocument.id,
      at: context.past(document.createdAt, `위키 문서 "${document.title}"`),
    });
  }
  console.log(`위키 문서 ${workspace.wiki.documents.length}개를 넣었습니다.`);
}
