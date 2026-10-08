import { Injectable } from '@nestjs/common';

import { AuthMembershipLockService } from '@/auth/auth-membership-lock.service';
import { CalendarReferenceLockQueryService } from '@/calendar/calendar-reference-lock-query.service';
import type { CuratedEdge } from '@/knowledge-graph/domain/curated-graph';
import { CuratedAccessProvider } from '@/knowledge-graph/infrastructure/curated-access/curated-access.provider';
import { ProjectReferenceLockQueryService } from '@/projects/project-reference-lock-query.service';
import { WikiReferenceLockQueryService } from '@/wiki/wiki-reference-lock-query.service';
@Injectable()
export class WorkosCuratedAccessAdapter extends CuratedAccessProvider {
  constructor(
    private readonly membership: AuthMembershipLockService,
    private readonly wiki: WikiReferenceLockQueryService,
    private readonly projects: ProjectReferenceLockQueryService,
    private readonly calendar: CalendarReferenceLockQueryService,
  ) {
    super();
  }
  async lockWriteAccess(organizationId: string, actorUserId: string) {
    const role = await this.membership.lockRole(organizationId, actorUserId);
    return role === 'owner' || role === 'admin';
  }
  lockEndpoint(
    organizationId: string,
    kind: CuratedEdge['sourceNodeKind'],
    id: string,
  ) {
    switch (kind) {
      case 'wiki_document':
        return this.wiki.lockDocument(organizationId, id);
      case 'project':
        return this.projects.lockProject(organizationId, id);
      case 'ticket':
        return this.projects.lockTicket(organizationId, id);
      case 'meeting':
        return this.calendar.lockMeeting(organizationId, id);
      case 'curated_node':
        throw new Error('curated 종단의 잠금은 원본 repository가 소유합니다.');
    }
  }
}
