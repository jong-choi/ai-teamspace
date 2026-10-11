import {
  describeToolInputProblems,
  dropEmptyOptionalArguments,
} from '@/agent/infrastructure/deep-agent/tool-input-feedback.middleware';

const meetingsListSchema = {
  type: 'object',
  properties: {
    from: { type: 'string', format: 'date-time' },
    category: { type: 'string', enum: ['team', 'sprint'] },
    search: { type: 'string', minLength: 1, maxLength: 100 },
    projectId: { type: 'string', minLength: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 20 },
    dueAt: {
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    },
    recurrence: { $ref: '#/$defs/Recurrence' },
  },
  required: ['from'],
  $defs: {
    Recurrence: { type: 'object', required: ['frequency'] },
  },
};

describe('describeToolInputProblems', () => {
  it('스키마에 맞는 인자는 문제로 보고하지 않는다', () => {
    expect(
      describeToolInputProblems(meetingsListSchema, {
        from: '2026-10-12T00:00:00+09:00',
        category: 'team',
        dueAt: null,
      }),
    ).toEqual([]);
  });

  it('빠진 필수 인자를 알려 준다', () => {
    expect(describeToolInputProblems(meetingsListSchema, {})).toEqual([
      'from: 필수 인자입니다.',
    ]);
  });

  it('빈 문자열이나 null로 채운 선택 인자는 생략하라고 알려 준다', () => {
    expect(
      describeToolInputProblems(meetingsListSchema, {
        from: '2026-10-12T00:00:00+09:00',
        search: '',
        projectId: null,
      }),
    ).toEqual([
      'search: 값이 없으면 인자를 생략합니다.',
      'projectId: 값이 없으면 인자를 생략합니다.',
    ]);
  });

  it('허용되지 않은 값에는 허용 값을 함께 알려 준다', () => {
    expect(
      describeToolInputProblems(meetingsListSchema, {
        from: '10월 12일',
        category: 'Meeting',
        limit: 100,
        dueAt: '내일',
        recurrence: 'weekly',
      }),
    ).toEqual([
      'from: 허용 값은 ISO 8601 시각(예: 2026-10-20T18:00:00+09:00)입니다.',
      'category: 허용 값은 team, sprint 중 하나입니다.',
      'limit: 허용 값은 1~20 정수입니다.',
      'dueAt: 허용 값은 ISO 8601 시각(예: 2026-10-20T18:00:00+09:00) 또는 null입니다.',
      'recurrence: 허용 값은 객체입니다.',
    ]);
  });

  it('도구에 없는 인자를 알려 준다', () => {
    expect(
      describeToolInputProblems(meetingsListSchema, {
        from: '2026-10-12T00:00:00+09:00',
        contentMarkdown: '본문',
      }),
    ).toEqual(['contentMarkdown: 이 도구에 없는 인자입니다.']);
  });

  it('추가 인자를 허용하는 스키마에서는 없는 인자를 문제 삼지 않는다', () => {
    expect(
      describeToolInputProblems(
        { ...meetingsListSchema, additionalProperties: true },
        { from: '2026-10-12T00:00:00+09:00', extra: 1 },
      ),
    ).toEqual([]);
  });
});

describe('dropEmptyOptionalArguments', () => {
  it('빈 문자열이나 null로 채운 선택 인자를 뺀다', () => {
    expect(
      dropEmptyOptionalArguments(meetingsListSchema, {
        from: '2026-10-12T00:00:00+09:00',
        search: '',
        projectId: null,
        category: 'team',
      }),
    ).toEqual({ from: '2026-10-12T00:00:00+09:00', category: 'team' });
  });

  it('스키마가 null을 받는 인자와 필수 인자는 그대로 둔다', () => {
    expect(
      dropEmptyOptionalArguments(meetingsListSchema, { from: '', dueAt: null }),
    ).toEqual({ from: '', dueAt: null });
  });

  it('도구에 없는 인자는 건드리지 않는다', () => {
    expect(
      dropEmptyOptionalArguments(meetingsListSchema, {
        from: '2026-10-12T00:00:00+09:00',
        contentMarkdown: '',
      }),
    ).toEqual({ from: '2026-10-12T00:00:00+09:00', contentMarkdown: '' });
  });
});
