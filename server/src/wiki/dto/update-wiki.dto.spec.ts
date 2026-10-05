import { UpdateWikiDocumentSchema } from '#server/wiki/dto/update-wiki-document.dto.js';
import { UpdateWikiFolderSchema } from '#server/wiki/dto/update-wiki-folder.dto.js';

describe('위키 PATCH DTO', () => {
  it('폴더 PATCH는 최소 한 필드를 요구한다', () => {
    expect(UpdateWikiFolderSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateWikiFolderSchema.safeParse({ name: '이름 변경' }).success,
    ).toBe(true);
    expect(
      UpdateWikiFolderSchema.safeParse({ parentFolderId: null }).success,
    ).toBe(true);
  });

  it('문서 PATCH는 최소 한 필드를 요구한다', () => {
    expect(UpdateWikiDocumentSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateWikiDocumentSchema.safeParse({ contentMarkdown: '# 변경' }).success,
    ).toBe(true);
    expect(UpdateWikiDocumentSchema.safeParse({ folderId: null }).success).toBe(
      true,
    );
  });
});
