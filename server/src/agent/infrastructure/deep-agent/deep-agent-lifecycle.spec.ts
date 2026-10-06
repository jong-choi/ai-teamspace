import { DeepAgentLifecycle } from '#server/agent/infrastructure/deep-agent/deep-agent-lifecycle.js';

describe('DeepAgent 생명주기', () => {
  test('값 처리가 끝나면 session을 정확히 한 번 종료한다', async () => {
    const close = jest.fn(async () => {});
    const lifecycle = new DeepAgentLifecycle(close);

    await expect(lifecycle.value(() => '완료')).resolves.toBe('완료');
    await lifecycle.close();

    expect(close).toHaveBeenCalledTimes(1);
  });

  test('실행과 session 종료가 함께 실패하면 두 오류를 모두 보존한다', async () => {
    const executionError = new Error('실행 실패');
    const closeError = new Error('종료 실패');
    const lifecycle = new DeepAgentLifecycle(() => Promise.reject(closeError));

    const failure = await lifecycle
      .value(() => Promise.reject(executionError))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([
      executionError,
      closeError,
    ]);
  });

  test('iterator 생성이 실패해도 session을 종료한다', async () => {
    const close = jest.fn(async () => {});
    const lifecycle = new DeepAgentLifecycle(close);
    const stream = lifecycle.iterable(() => {
      throw new Error('iterator 생성 실패');
    });

    await expect(stream.next()).rejects.toThrow('iterator 생성 실패');
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('소비자가 stream을 조기에 중단해도 session을 종료한다', async () => {
    const close = jest.fn(async () => {});
    const lifecycle = new DeepAgentLifecycle(close);
    const stream = lifecycle.iterable(async function* () {
      yield '첫 번째';
      yield '두 번째';
    });

    for await (const item of stream) {
      expect(item).toBe('첫 번째');
      break;
    }

    expect(close).toHaveBeenCalledTimes(1);
  });
});
