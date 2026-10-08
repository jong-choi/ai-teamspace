import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import { ProjectReferenceLockRepository } from '@/projects/infrastructure/persistence/project-reference-lock.repository';

import { and, eq } from 'drizzle-orm';
@Injectable()
export class ProjectReferenceLockDrizzleRepository extends ProjectReferenceLockRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }
  async lockProject(organizationId: string, id: string) {
    const [row] = await this.database
      .requireTransaction()
      .select({ id: project.id })
      .from(project)
      .where(
        and(eq(project.organizationId, organizationId), eq(project.id, id)),
      )
      .for('share');
    return row !== undefined;
  }
  async lockTicket(organizationId: string, id: string) {
    const [row] = await this.database
      .requireTransaction()
      .select({ id: ticket.id })
      .from(ticket)
      .where(and(eq(ticket.organizationId, organizationId), eq(ticket.id, id)))
      .for('share');
    return row !== undefined;
  }
}
