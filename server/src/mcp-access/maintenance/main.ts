import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { McpAccessMaintenanceModule } from '@/mcp-access/maintenance/mcp-access-maintenance.module';
import {
  McpAccessMaintenanceService,
  McpAccessMaintenanceTargetsSchema,
} from '@/mcp-access/maintenance/mcp-access-maintenance.service';

function parseInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(name + ' must be a non-negative integer.');
  }
  return parsed;
}

async function bootstrap() {
  const rawTargets = process.env.MCP_ACCESS_MAINTENANCE_TARGETS_JSON;
  if (!rawTargets) {
    throw new Error(
      'MCP_ACCESS_MAINTENANCE_TARGETS_JSON is required. Example: [{"organizationId":"org","userIds":["user"]}]',
    );
  }

  const targets = McpAccessMaintenanceTargetsSchema.parse(
    JSON.parse(rawTargets) as unknown,
  );
  const cursor = parseInteger(
    process.env.MCP_ACCESS_MAINTENANCE_CURSOR,
    0,
    'MCP_ACCESS_MAINTENANCE_CURSOR',
  );
  const limit = parseInteger(
    process.env.MCP_ACCESS_MAINTENANCE_LIMIT,
    100,
    'MCP_ACCESS_MAINTENANCE_LIMIT',
  );

  const app = await NestFactory.createApplicationContext(
    McpAccessMaintenanceModule,
  );
  try {
    const progress = await app
      .get(McpAccessMaintenanceService)
      .runBatch({ targets, cursor, limit });

    Logger.log(
      JSON.stringify({
        event: 'mcp.policy.maintenance.completed',
        ...progress,
      }),
      'McpAccessMaintenance',
    );
  } finally {
    await app.close();
  }
}

await bootstrap();
