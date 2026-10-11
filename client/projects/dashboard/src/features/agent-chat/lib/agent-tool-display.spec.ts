import {
  formatAgentToolResult,
  getAgentToolSource,
  projectAgentToolDisplay,
} from '@core/features/agent-chat/lib/agent-tool-display';

import { describe, expect, it } from '@jest/globals';

describe('Agent tool presentation', () => {
  it('상세 결과는 중첩 관계와 긴 내용을 보존하고 인증 정보만 가린다', () => {
    const description = '상세 내용 '.repeat(100);
    const value = {
      nodes: [{ title: '프로젝트', description }],
      relations: ['김도윤 -[담당]-> 프로젝트'],
      metadata: { token: 'private-secret', message: 'password=hidden-value' },
    };
    const details = formatAgentToolResult(JSON.stringify(value));
    expect(details).toContain(description);
    expect(details).toContain('김도윤 -[담당]-> 프로젝트');
    expect(details).toContain('\n');
    expect(details).not.toContain('private-secret');
    expect(details).not.toContain('hidden-value');
  });

  it('지식 검색은 내부 도구로 표시하고 문서와 업무 원본을 각각 센다', () => {
    const display = projectAgentToolDisplay({
      name: 'knowledge_search',
      args: { q: '리뉴얼' },
      result: null,
      structured: { items: [], records: [{ title: '리뉴얼 업무' }] },
    });
    expect(getAgentToolSource('knowledge_search')).toEqual({
      kind: 'teamspace',
    });
    expect(display).toEqual({
      label: '지식 그래프 검색',
      fields: [{ label: '검색어', value: '리뉴얼' }],
      resultSummary: '문서 0개 · 업무 원본 1개',
    });
  });

  it('지식 맥락은 원본이 없어도 개념과 관계 결과를 표시한다', () => {
    const display = projectAgentToolDisplay({
      name: 'knowledge_get_context',
      args: {},
      result: {
        nodes: [],
        entities: ['리뉴얼', '최유진'],
        relations: ['관계'],
      },
    });
    expect(getAgentToolSource('knowledge_get_context')).toEqual({
      kind: 'teamspace',
    });
    expect(display.label).toBe('지식 그래프 맥락 조회');
    expect(display.resultSummary).toBe('원본 0개 · 개념 2개 · 관계 1개');
  });

  it('canonical tool name을 사용자용 label로 바꾸고 raw name을 primary UI에 노출하지 않는다', () => {
    expect(
      projectAgentToolDisplay({
        name: 'wiki_document_update',
        args: { title: '운영 문서' },
        result: null,
      }),
    ).toMatchObject({
      label: '위키 문서 수정',
      fields: [{ label: '제목', value: '운영 문서' }],
    });
  });

  it('위키 본문 부분 수정은 기존 문구와 바꿀 문구를 보여준다', () => {
    expect(
      projectAgentToolDisplay({
        name: 'wiki_document_update',
        args: {
          documentId: 'document-a',
          contentEdit: {
            startLine: 4,
            oldText: '> 오늘 딴 귤,\n내일 우리 집',
            newText: '',
          },
        },
        result: null,
      }).fields,
    ).toEqual([
      { label: '기존 문구', value: '> 오늘 딴 귤, 내일 우리 집' },
      { label: '바꿀 문구', value: '(삭제)' },
    ]);
  });

  it('unknown external tool은 raw technical name 대신 generic label을 사용한다', () => {
    const display = projectAgentToolDisplay({
      name: 'evil_vendor_debug_dump',
      args: {},
      result: null,
    });

    expect(display.label).toBe('외부 도구 작업');
    expect(JSON.stringify(display)).not.toContain('evil_vendor_debug_dump');
  });

  it('credential/header/internal technical field는 allowlist 밖으로 숨긴다', () => {
    const display = projectAgentToolDisplay({
      name: 'chat_message_send',
      args: {
        message: '안녕하세요',
        authorization: 'Bearer secret',
        cookie: 'session=secret',
        token: 'raw-secret',
        organizationId: 'org-internal-id',
        mutationReceipt: 'technical',
      },
      result: null,
    });

    expect(display.fields).toEqual([{ label: '메시지', value: '안녕하세요' }]);
    expect(JSON.stringify(display)).not.toContain('raw-secret');
    expect(JSON.stringify(display)).not.toContain('org-internal-id');
    expect(JSON.stringify(display)).not.toContain('technical');
  });

  it('허용된 text 내부의 token-like 값도 redact하고 길이를 제한한다', () => {
    const display = projectAgentToolDisplay({
      name: 'wiki_search',
      args: {
        query: 'token=very-secret-value ' + 'x'.repeat(300),
      },
      result: 'authorization: abc123 ' + 'y'.repeat(400),
    });

    expect(display.fields[0]?.value).not.toContain('very-secret-value');
    expect(display.fields[0]?.value.length).toBeLessThanOrEqual(160);
    expect(display.resultSummary).not.toContain('abc123');
    expect(display.resultSummary?.length).toBeLessThanOrEqual(220);
  });

  it('복합 result를 raw JSON으로 dump하지 않고 safe summary/count만 표시한다', () => {
    const display = projectAgentToolDisplay({
      name: 'projects_list',
      args: {},
      result: {
        projects: [{ id: 'a' }, { id: 'b' }],
        credential: 'must-not-leak',
      },
    });

    expect(display.resultSummary).toBe('결과 2개');
    expect(JSON.stringify(display)).not.toContain('must-not-leak');
  });
});
