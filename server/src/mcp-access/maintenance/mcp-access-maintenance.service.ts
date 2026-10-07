import { Injectable } from '@nestjs/common';

import { McpAccessService } from '@/mcp-access/mcp-access.service';

import { z } from 'zod';

const maxBatchSize = 100;

export const McpAccessMaintenanceTargetSchema = z.object({
  organizationId: z.string().min(1),
  userIds: z.array(z.string().min(1)).default([]),
});

export const McpAccessMaintenanceTargetsSchema = z.array(
  McpAccessMaintenanceTargetSchema,
);

export type McpAccessMaintenanceTarget = z.infer<
  typeof McpAccessMaintenanceTargetSchema
>;

export type McpAccessMaintenanceProgress = {
  cursor: number;
  nextCursor: number | null;
  processedTasks: number;
  totalTasks: number;
  ensuredOrganizations: number;
  ensuredUsers: number;
  deletedStaleUsers: number;
};

type MaintenanceTask =
  | { type: 'organization'; organizationId: string }
  | { type: 'user'; organizationId: string; userId: string };

@Injectable()
export class McpAccessMaintenanceService {
  constructor(private readonly mcpAccessService: McpAccessService) {}

  async runBatch(input: {
    targets: readonly McpAccessMaintenanceTarget[];
    cursor?: number;
    limit?: number;
  }): Promise<McpAccessMaintenanceProgress> {
    const targets = McpAccessMaintenanceTargetsSchema.parse(input.targets);
    const tasks = buildMaintenanceTasks(targets);
    const cursor = Math.max(0, Math.trunc(input.cursor ?? 0));
    const limit = Math.min(
      maxBatchSize,
      Math.max(1, Math.trunc(input.limit ?? maxBatchSize)),
    );
    const batch = tasks.slice(cursor, cursor + limit);

    let ensuredOrganizations = 0;
    let ensuredUsers = 0;
    let deletedStaleUsers = 0;

    for (const task of batch) {
      if (task.type === 'organization') {
        await this.mcpAccessService.ensureOrganizationPolicy(
          task.organizationId,
        );
        ensuredOrganizations += 1;
        continue;
      }

      const result = await this.mcpAccessService.reconcileUserPolicyMembership(
        task.organizationId,
        task.userId,
        'reconciliation',
      );
      if (result === 'ensured') ensuredUsers += 1;
      else deletedStaleUsers += 1;
    }

    const nextCursor =
      cursor + batch.length < tasks.length ? cursor + batch.length : null;

    return {
      cursor,
      nextCursor,
      processedTasks: batch.length,
      totalTasks: tasks.length,
      ensuredOrganizations,
      ensuredUsers,
      deletedStaleUsers,
    };
  }
}

function buildMaintenanceTasks(
  targets: readonly McpAccessMaintenanceTarget[],
): MaintenanceTask[] {
  const tasks: MaintenanceTask[] = [];
  const seenOrganizations = new Set<string>();
  const seenUsers = new Set<string>();

  for (const target of targets) {
    if (!seenOrganizations.has(target.organizationId)) {
      seenOrganizations.add(target.organizationId);
      tasks.push({
        type: 'organization',
        organizationId: target.organizationId,
      });
    }

    for (const userId of target.userIds) {
      const key = target.organizationId + '\u0000' + userId;
      if (seenUsers.has(key)) continue;
      seenUsers.add(key);
      tasks.push({
        type: 'user',
        organizationId: target.organizationId,
        userId,
      });
    }
  }

  return tasks;
}
