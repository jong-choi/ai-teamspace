import type { WikiTextPatch } from '@/wiki/domain/wiki-content-edit';

export type WikiCollaborationSnapshot = {
  encodedState: Uint8Array;
  contentMarkdown: string;
};

export abstract class WikiCollaborationStateProvider {
  abstract create(contentMarkdown: string): WikiCollaborationSnapshot;

  abstract decode(encodedState: Uint8Array): WikiCollaborationSnapshot;

  /**
   * 기존 상태 위에 본문 patch 하나를 공동편집 연산으로 적용한 상태를 돌려준다.
   */
  abstract applyTextPatch(
    encodedState: Uint8Array,
    patch: WikiTextPatch,
  ): WikiCollaborationSnapshot;
}
