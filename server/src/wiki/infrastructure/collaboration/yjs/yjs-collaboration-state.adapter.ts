import { Injectable } from '@nestjs/common';

import { WikiCollaborationStateCorruptedError } from '@/wiki/domain/wiki.error';
import {
  type WikiCollaborationSnapshot,
  WikiCollaborationStateProvider,
} from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';

import * as Y from 'yjs';

@Injectable()
export class YjsCollaborationStateAdapter extends WikiCollaborationStateProvider {
  create(contentMarkdown: string): WikiCollaborationSnapshot {
    const document = new Y.Doc();
    if (contentMarkdown.length > 0) {
      document.getText('markdown').insert(0, contentMarkdown);
    } else {
      document.getText('markdown');
    }
    return toSnapshot(document);
  }

  decode(encodedState: Uint8Array): WikiCollaborationSnapshot {
    try {
      const document = new Y.Doc();
      Y.applyUpdate(document, encodedState);
      return toSnapshot(document);
    } catch (error) {
      throw new WikiCollaborationStateCorruptedError({ cause: error });
    }
  }
}

function toSnapshot(document: Y.Doc): WikiCollaborationSnapshot {
  return {
    encodedState: Y.encodeStateAsUpdate(document),
    contentMarkdown: document.getText('markdown').toJSON(),
  };
}
