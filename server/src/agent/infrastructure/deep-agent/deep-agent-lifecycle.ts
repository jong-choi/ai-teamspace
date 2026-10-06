export class DeepAgentLifecycle {
  private closePromise: Promise<void> | undefined;

  constructor(private readonly closeSession: () => Promise<void>) {}

  close(): Promise<void> {
    this.closePromise ??= this.closeSession();
    return this.closePromise;
  }

  async value<T>(load: () => T | Promise<T>): Promise<T> {
    let result: T;
    try {
      result = await load();
    } catch (error) {
      try {
        await this.close();
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          'DeepAgent 실행 오류 뒤 MCP session 종료에도 실패했습니다.',
        );
      }
      throw error;
    }

    await this.close();
    return result;
  }

  async *iterable<T>(
    load: () => AsyncIterable<T> | Promise<AsyncIterable<T>>,
  ): AsyncGenerator<T> {
    const outcome: { failed: boolean; failure?: unknown } = { failed: false };
    try {
      const iterable = await load();
      for await (const item of iterable) yield item;
    } catch (error) {
      outcome.failed = true;
      outcome.failure = error;
    } finally {
      await this.closeIterable(outcome);
    }

    if (outcome.failed) throw outcome.failure;
  }

  private async closeIterable(outcome: {
    failed: boolean;
    failure?: unknown;
  }): Promise<void> {
    try {
      await this.close();
    } catch (closeError) {
      if (outcome.failed) {
        throw new AggregateError(
          [outcome.failure, closeError],
          'DeepAgent stream 오류 뒤 MCP session 종료에도 실패했습니다.',
        );
      }
      throw closeError;
    }
  }
}

export function noOpDeepAgentLifecycle(): DeepAgentLifecycle {
  return new DeepAgentLifecycle(async () => {});
}
