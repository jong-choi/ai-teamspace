export type WikiCollaborationSnapshot = {
  encodedState: Uint8Array;
  contentMarkdown: string;
};

export abstract class WikiCollaborationStateProvider {
  abstract create(contentMarkdown: string): WikiCollaborationSnapshot;

  abstract decode(encodedState: Uint8Array): WikiCollaborationSnapshot;
}
