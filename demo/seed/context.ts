import type { ApiSession } from '#seed/api.ts';
import type { DemoClock, RelativeTime } from '#seed/relative-time.ts';

// 서버는 작성 시각을 항상 지금으로 찍는다. 넣은 뒤에 과거로 옮길 대상을 모아 둔다.
export type Backdate =
  | { kind: 'project'; id: string; createdAt: Date; updatedAt: Date }
  | { kind: 'ticket'; id: string; createdAt: Date; updatedAt: Date }
  | { kind: 'ticketComment'; id: string; at: Date }
  | { kind: 'wikiDocument'; id: string; at: Date }
  | { kind: 'chatMessage'; id: string; at: Date }
  | { kind: 'chatConversation'; id: string; startedAt: Date; updatedAt: Date };

// 데모 계정이 읽은 곳까지 표시할 대화다. 시각을 옮긴 뒤에 적용한다.
export type PendingRead = { conversationId: string; messageId: string };

export class SeedContext {
  readonly clock: DemoClock;
  readonly demoUsername: string;
  readonly now: Date;
  readonly backdates: Backdate[] = [];
  readonly pendingReads: PendingRead[] = [];
  private readonly sessions = new Map<string, ApiSession>();
  private readonly userIds = new Map<string, string>();
  private readonly organizationIds = new Map<string, string>();

  constructor(clock: DemoClock, demoUsername: string, now: Date) {
    this.clock = clock;
    this.demoUsername = demoUsername;
    this.now = now;
  }

  addUser(username: string, userId: string, session: ApiSession): void {
    this.userIds.set(username, userId);
    this.sessions.set(username, session);
  }

  addOrganization(slug: string, organizationId: string): void {
    this.organizationIds.set(slug, organizationId);
  }

  userId(username: string): string {
    const userId = this.userIds.get(username);
    if (!userId) throw new Error(`데모 자료에 없는 사용자입니다: ${username}`);
    return userId;
  }

  session(username: string): ApiSession {
    const session = this.sessions.get(username);
    if (!session) throw new Error(`데모 자료에 없는 사용자입니다: ${username}`);
    return session;
  }

  organizationId(slug: string): string {
    const organizationId = this.organizationIds.get(slug);
    if (!organizationId)
      throw new Error(`데모 자료에 없는 조직입니다: ${slug}`);
    return organizationId;
  }

  // 이미 일어난 일로 적어야 하는 시각이다. 실행 시점보다 뒤면 자료가 잘못된 것이다.
  past(relative: RelativeTime, subject: string): Date {
    const instant = this.clock.resolve(relative);
    if (instant.getTime() > this.now.getTime()) {
      throw new Error(
        `아직 오지 않은 시각에 작성된 데모 자료입니다: ${subject}`,
      );
    }
    return instant;
  }
}
