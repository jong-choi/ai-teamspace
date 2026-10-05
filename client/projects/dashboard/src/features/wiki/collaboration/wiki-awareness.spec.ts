import { collectWikiCollaborators } from '@core/features/wiki/collaboration/wiki-awareness';
import { createWikiRelativeSelection } from '@core/features/wiki/collaboration/wiki-relative-selection';

import { describe, expect, it } from '@jest/globals';
import * as Y from 'yjs';

describe('위키 공동편집 awareness', () => {
  it('인증된 사용자 정보와 relative selection을 collaborator로 변환한다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    text.insert(0, 'hello world');
    const selection = createWikiRelativeSelection(text, { start: 6, end: 11 });

    const collaborators = collectWikiCollaborators({
      document,
      text,
      states: new Map([
        [
          10,
          {
            user: { id: 'user-b', name: '사용자 B', color: 'hsl(20 70% 45%)' },
            selection,
          },
        ],
      ]),
    });

    expect(collaborators).toEqual([
      {
        clientId: 10,
        userId: 'user-b',
        name: '사용자 B',
        color: 'hsl(20 70% 45%)',
        selection: { start: 6, end: 11 },
      },
    ]);
  });

  it('유효하지 않은 awareness payload를 UI collaborator로 노출하지 않는다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');

    expect(
      collectWikiCollaborators({
        document,
        text,
        states: new Map([
          [1, { user: { id: '', name: '잘못된 사용자', color: 'red' } }],
          [2, { selection: { start: 0, end: 0 } }],
        ]),
      }),
    ).toEqual([]);
  });

  it('현재 Y.Doc의 local client awareness는 remote collaborator 목록에서 제외한다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    const states = new Map<number, unknown>([
      [
        document.clientID,
        {
          user: {
            id: 'local-user',
            name: '내 사용자',
            color: 'hsl(1 70% 45%)',
          },
        },
      ],
      [
        30,
        {
          user: {
            id: 'remote-user',
            name: '원격 사용자',
            color: 'hsl(2 70% 45%)',
          },
        },
      ],
    ]);

    expect(
      collectWikiCollaborators({
        document,
        text,
        states,
        localClientId: document.clientID,
      }).map(({ userId }) => userId),
    ).toEqual(['remote-user']);
  });

  it('같은 사용자의 여러 connection은 가장 작은 client id 하나로 표시한다', () => {
    const document = new Y.Doc();
    const text = document.getText('markdown');
    const states = new Map<number, unknown>([
      [
        20,
        {
          user: { id: 'user-a', name: '가 사용자', color: 'hsl(1 70% 45%)' },
        },
      ],
      [
        10,
        {
          user: { id: 'user-a', name: '가 사용자', color: 'hsl(1 70% 45%)' },
        },
      ],
      [
        30,
        {
          user: { id: 'user-b', name: '나 사용자', color: 'hsl(2 70% 45%)' },
        },
      ],
    ]);

    expect(
      collectWikiCollaborators({ document, text, states }).map(
        ({ clientId, userId }) => ({ clientId, userId }),
      ),
    ).toEqual([
      { clientId: 10, userId: 'user-a' },
      { clientId: 30, userId: 'user-b' },
    ]);
  });
});
