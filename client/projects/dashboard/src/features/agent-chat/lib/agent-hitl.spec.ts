import {
  AGENT_HITL_REJECT_PREFIX,
  createAgentHitlResume,
  createDefaultAgentHitlDrafts,
  parseAgentHitlInterrupts,
  parseAgentHitlPresentation,
} from '@core/features/agent-chat/lib/agent-hitl';

import { describe, expect, it } from '@jest/globals';

const twoActions = {
  actionRequests: [
    {
      name: 'wiki_document_create',
      args: { title: '운영 문서', token: 'must-not-render' },
      description: '위키 문서를 만듭니다.',
    },
    { name: 'project_ticket_move', args: { ticketId: 't-1' } },
  ],
  reviewConfigs: [
    {
      actionName: 'wiki_document_create',
      allowedDecisions: ['approve', 'edit', 'reject'],
      argsSchema: {
        type: 'object',
        properties: { title: { type: 'string', minLength: 1 } },
        required: ['title'],
      },
    },
    {
      actionName: 'project_ticket_move',
      allowedDecisions: ['approve', 'reject'],
    },
  ],
};

describe('Agent HITL 해석', () => {
  it('LangChain HITL 요청을 secret이 가려진 작업 목록으로 바꾼다', () => {
    const result = parseAgentHitlPresentation(twoActions);

    expect(result?.actions).toHaveLength(2);
    expect(result?.actions[0]).toMatchObject({
      label: '위키 문서 생성',
      description: '위키 문서를 만듭니다.',
      arguments: [
        { key: 'title', value: '운영 문서' },
        { key: 'token', value: '••••' },
      ],
      allowedDecisions: ['approve', 'edit', 'reject'],
    });
  });

  it('action과 review 짝이 어긋나면 실행 가능한 UI로 만들지 않는다', () => {
    expect(
      parseAgentHitlPresentation({
        actionRequests: [{ name: 'write_a', args: {} }],
        reviewConfigs: [
          { actionName: 'write_b', allowedDecisions: ['approve'] },
        ],
      }),
    ).toBeNull();
  });

  it('interrupt가 여러 개면 임의 결정을 막기 위해 해석하지 않는다', () => {
    expect(parseAgentHitlInterrupts([twoActions, twoActions])).toBeNull();
    expect(parseAgentHitlInterrupts([twoActions])).not.toBeNull();
  });

  it('기본 결정 초안은 secret을 가린 JSON으로 편집값을 채운다', () => {
    const presentation = parseAgentHitlPresentation(twoActions)!;
    const drafts = createDefaultAgentHitlDrafts(presentation);

    expect(drafts[0]?.type).toBe('approve');
    expect(drafts[0]?.editedArgsText).toContain('"token": "••••"');
    expect(drafts[0]?.editedArgsText).not.toContain('must-not-render');
  });
});

describe('Agent HITL resume payload', () => {
  const presentation = parseAgentHitlPresentation(twoActions)!;

  it('작업별 결정을 조합해 resume payload를 만든다', () => {
    const result = createAgentHitlResume(presentation, [
      {
        type: 'edit',
        editedArgsText: '{"title":"수정 제목","token":"••••"}',
        rejectMessage: '',
      },
      {
        type: 'reject',
        editedArgsText: '{}',
        rejectMessage: '아직 이동하지 마세요',
      },
    ]);

    expect(result).toEqual({
      ok: true,
      resume: {
        decisions: [
          {
            type: 'edit',
            editedAction: {
              name: 'wiki_document_create',
              args: { title: '수정 제목', token: 'must-not-render' },
            },
          },
          {
            type: 'reject',
            message: `${AGENT_HITL_REJECT_PREFIX} 사유: 아직 이동하지 마세요`,
          },
        ],
      },
    });
  });

  it('허용되지 않은 결정은 해당 작업 오류로 돌려준다', () => {
    const result = createAgentHitlResume(presentation, [
      { type: 'approve', editedArgsText: '{}', rejectMessage: '' },
      { type: 'edit', editedArgsText: '{}', rejectMessage: '' },
    ]);

    expect(result).toEqual({
      ok: false,
      errors: { 1: '이 작업에 허용되지 않은 결정입니다.' },
    });
  });

  it('수정 인자가 JSON이 아니거나 argsSchema를 어기면 오류를 표시한다', () => {
    const invalidJson = createAgentHitlResume(presentation, [
      { type: 'edit', editedArgsText: '{title', rejectMessage: '' },
      { type: 'approve', editedArgsText: '{}', rejectMessage: '' },
    ]);
    expect(invalidJson).toEqual({
      ok: false,
      errors: { 0: '인자는 올바른 JSON이어야 합니다.' },
    });

    const schemaViolation = createAgentHitlResume(presentation, [
      { type: 'edit', editedArgsText: '{"title":""}', rejectMessage: '' },
      { type: 'approve', editedArgsText: '{}', rejectMessage: '' },
    ]);
    expect(schemaViolation).toEqual({
      ok: false,
      errors: { 0: '인자 "title"가 올바르지 않습니다.' },
    });
  });

  it('거절 사유가 없으면 기본 거절 문구만 보낸다', () => {
    const result = createAgentHitlResume(presentation, [
      { type: 'approve', editedArgsText: '{}', rejectMessage: '' },
      { type: 'reject', editedArgsText: '{}', rejectMessage: '  ' },
    ]);

    expect(result).toEqual({
      ok: true,
      resume: {
        decisions: [
          { type: 'approve' },
          { type: 'reject', message: AGENT_HITL_REJECT_PREFIX },
        ],
      },
    });
  });
});
