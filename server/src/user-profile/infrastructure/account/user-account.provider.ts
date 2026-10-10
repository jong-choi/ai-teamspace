import type { IncomingHttpHeaders } from 'node:http';

// 로그인한 사용자의 계정 정보를 바꾸는 port다. 요청 header의 session으로 사용자를 식별한다.
export abstract class UserAccountProvider {
  abstract updateImage(
    headers: IncomingHttpHeaders,
    image: string | null,
  ): Promise<void>;
}
