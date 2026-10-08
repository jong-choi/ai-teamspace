import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { TicketLabelProjectionSourceSchema } from '@/projects/domain/ticket-label-projection-source';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ticketLabel } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema';
import { TicketLabelProjectionSourceRepository } from '@/projects/infrastructure/persistence/ticket-label-projection-source.repository';

import { and, asc, eq, gt } from 'drizzle-orm';

@Injectable()
export class TicketLabelProjectionSourceDrizzleRepository extends TicketLabelProjectionSourceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async current(organizationId: string, labelId: string) {
    const [row] = await this.database.db
      .select({
        id: ticketLabel.id,
        organizationId: project.organizationId,
        projectId: ticketLabel.projectId,
        name: ticketLabel.name,
        color: ticketLabel.color,
        updatedAt: ticketLabel.updatedAt,
      })
      .from(ticketLabel)
      .innerJoin(project, eq(project.id, ticketLabel.projectId))
      .where(
        and(
          eq(project.organizationId, organizationId),
          eq(ticketLabel.id, labelId),
        ),
      )
      .limit(1);
    return row ? TicketLabelProjectionSourceSchema.parse(row) : null;
  }
  async listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: ticketLabel.id })
      .from(ticketLabel)
      .innerJoin(project, eq(project.id, ticketLabel.projectId))
      .where(
        and(
          eq(project.organizationId, organizationId),
          afterId ? gt(ticketLabel.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(ticketLabel.id))
      .limit(limit);
  }
}
