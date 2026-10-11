import { DeepAgentBuilder } from '@/agent/infrastructure/deep-agent/deep-agent.builder';
import { isRetryableModelFailure } from '@/agent/infrastructure/deep-agent/model-retry.middleware';

import { jest } from '@jest/globals';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';
import { GraphInterrupt } from '@langchain/langgraph';

class ProviderResponseError extends Error {
  constructor(
    message: string,
    readonly status_code: number,
  ) {
    super(message);
    this.name = 'ResponseError';
  }
}

class FlakyModel extends FakeStreamingChatModel {
  calls = 0;
  private readonly failures: Error[];

  constructor(failures: Error[]) {
    super({ responses: [new AIMessage('안녕하세요')] });
    this.failures = [...failures];
  }

  override bindTools() {
    return this;
  }

  override async _generate(
    ...input: Parameters<FakeStreamingChatModel['_generate']>
  ) {
    this.failNext();
    return super._generate(...input);
  }

  override async *_streamResponseChunks(
    ...input: Parameters<FakeStreamingChatModel['_streamResponseChunks']>
  ) {
    this.failNext();
    yield* super._streamResponseChunks(...input);
  }

  private failNext(): void {
    this.calls += 1;
    const failure = this.failures.shift();
    if (failure) throw failure;
  }
}

function buildAgent(model: FlakyModel) {
  return new DeepAgentBuilder().buildExecution({
    models: { root: model, researcher: model, operator: model },
    session: {
      tools: [],
      readOnlyTools: [],
      interruptOn: {},
      toolIdentities: new Map(),
      close: () => Promise.resolve(),
    },
  });
}

// backoff 대기를 실제로 기다리지 않도록 가짜 timer를 끝날 때까지 돌린다.
async function settle<T>(run: Promise<T>): Promise<PromiseSettledResult<T>> {
  let result: PromiseSettledResult<T> | null = null;
  void run.then(
    (value) => {
      result = { status: 'fulfilled', value };
    },
    (reason: unknown) => {
      result = { status: 'rejected', reason };
    },
  );
  for (let round = 0; round < 200 && result === null; round += 1) {
    await jest.advanceTimersByTimeAsync(20_000);
  }
  if (result === null) throw new Error('실행이 끝나지 않았습니다.');
  return result;
}

describe('모델 호출 재시도 판정', () => {
  it.each([500, 502, 503, 429, 408])(
    '상태 코드 %i는 다시 시도한다',
    (status) => {
      expect(
        isRetryableModelFailure(new ProviderResponseError('실패', status)),
      ).toBe(true);
    },
  );

  it.each([400, 401, 403, 404, 422])(
    '상태 코드 %i는 다시 시도하지 않는다',
    (status) => {
      expect(
        isRetryableModelFailure(new ProviderResponseError('실패', status)),
      ).toBe(false);
    },
  );

  it('상태 코드 없이 스트림 도중 실패한 오류는 다시 시도한다', () => {
    expect(
      isRetryableModelFailure(new Error('Internal Server Error (ref: abc)')),
    ).toBe(true);
  });

  it('다른 middleware가 감싼 오류는 cause의 상태 코드로 판정한다', () => {
    const wrapped = new Error('실패', {
      cause: new Error('실패', {
        cause: new ProviderResponseError('실패', 401),
      }),
    });

    expect(isRetryableModelFailure(wrapped)).toBe(false);
  });

  it('사용자가 취소한 호출은 다시 시도하지 않는다', () => {
    expect(
      isRetryableModelFailure(new DOMException('aborted', 'AbortError')),
    ).toBe(false);
    expect(isRetryableModelFailure(new Error('Aborted'))).toBe(false);
  });

  it('interrupt는 다시 시도하지 않는다', () => {
    expect(isRetryableModelFailure(new GraphInterrupt())).toBe(false);
  });
});

describe('transientModelRetryMiddleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('일시적인 실패 뒤에 성공하면 실행을 이어 간다', async () => {
    const model = new FlakyModel([
      new ProviderResponseError('Internal Server Error', 500),
      new Error('Internal Server Error (ref: abc)'),
    ]);

    const result = await settle(
      buildAgent(model).invoke({ messages: [new HumanMessage('안녕')] }),
    );

    expect(model.calls).toBe(3);
    if (result.status !== 'fulfilled') throw result.reason;
    expect(
      result.value.messages.filter((message) => AIMessage.isInstance(message)),
    ).toHaveLength(1);
    expect(result.value.messages.at(-1)?.text).toBe('안녕하세요');
  });

  it('다섯 번 다시 시도해도 실패하면 실행을 오류로 끝낸다', async () => {
    const model = new FlakyModel(
      Array.from(
        { length: 10 },
        () => new ProviderResponseError('Internal Server Error', 500),
      ),
    );

    const result = await settle(
      buildAgent(model).invoke({ messages: [new HumanMessage('안녕')] }),
    );

    expect(model.calls).toBe(6);
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { message: 'Internal Server Error' },
    });
  });

  it('요청 오류는 다시 시도하지 않고 바로 실패한다', async () => {
    const model = new FlakyModel([
      new ProviderResponseError('bad request', 400),
    ]);

    const result = await settle(
      buildAgent(model).invoke({ messages: [new HumanMessage('안녕')] }),
    );

    expect(model.calls).toBe(1);
    expect(result.status).toBe('rejected');
  });
});
