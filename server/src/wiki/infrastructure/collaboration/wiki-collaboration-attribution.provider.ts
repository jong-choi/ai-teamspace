export type WikiCollaborationAttributionSnapshot = {
  lastEditorUserId: string | null;
  collaboratorUserIds: string[];
  maxSequence: number | null;
};

export abstract class WikiCollaborationAttributionProvider {
  abstract checkReady(): Promise<void>;

  abstract record(documentName: string, userId: string): Promise<void>;

  abstract snapshot(
    documentName: string,
  ): Promise<WikiCollaborationAttributionSnapshot>;

  abstract clearThrough(
    documentName: string,
    maxSequence: number,
  ): Promise<void>;

  abstract close(): Promise<void>;
}
