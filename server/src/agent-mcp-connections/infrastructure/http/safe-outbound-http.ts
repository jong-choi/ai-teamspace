export abstract class SafeOutboundHttp {
  abstract assertSafe(input: string | URL): Promise<URL>;

  abstract fetch(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response>;
}
