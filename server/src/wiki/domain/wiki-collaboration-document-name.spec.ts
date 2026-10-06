import { WikiCollaborationInvalidDocumentNameError } from '@/wiki/domain/wiki.error';
import {
  buildWikiCollaborationDocumentName,
  parseWikiCollaborationDocumentName,
} from '@/wiki/domain/wiki-collaboration-document-name';

const documentId = '11111111-1111-4111-8111-111111111111';

describe('위키 공동편집 문서 이름', () => {
  it('organization과 document scope를 고정 형식으로 직렬화하고 파싱한다', () => {
    const documentName = buildWikiCollaborationDocumentName({
      organizationId: 'organization-a',
      documentId,
    });

    expect(documentName).toBe(`wiki.organization-a.${documentId}`);
    expect(parseWikiCollaborationDocumentName(documentName)).toEqual({
      organizationId: 'organization-a',
      documentId,
    });
  });

  it.each([
    '',
    `wiki.organization-a.${documentId}.extra`,
    `other.organization-a.${documentId}`,
    `wiki.organization.with-dot.${documentId}`,
    'wiki.organization-a.not-a-uuid',
  ])('잘못된 문서 이름 %s 을 거부한다', (documentName) => {
    expect(() => parseWikiCollaborationDocumentName(documentName)).toThrow(
      WikiCollaborationInvalidDocumentNameError,
    );
  });
});
