import { Module } from '@nestjs/common';

import { CalendarModule } from '@/calendar/calendar.module';
import { ChatModule } from '@/chat/chat.module';
import { KnowledgeGraphReadModule } from '@/knowledge-graph/knowledge-graph-read.module';
import { KnowledgeGraphSearchModule } from '@/knowledge-graph/knowledge-graph-search.module';
import { CalendarMcpRegistrar } from '@/mcp/tools/calendar/calendar-mcp.registrar';
import { ChatMcpRegistrar } from '@/mcp/tools/chat/chat-mcp.registrar';
import { KnowledgeGraphMcpRegistrar } from '@/mcp/tools/knowledge-graph/knowledge-graph-mcp.registrar';
import { McpKnowledgeScopeResolver } from '@/mcp/tools/knowledge-graph/mcp-knowledge-scope.resolver';
import { McpToolAuthorizationService } from '@/mcp/tools/mcp-tool-authorization.service';
import { McpToolRegistryService } from '@/mcp/tools/mcp-tool-registry.service';
import { OrganizationMcpRegistrar } from '@/mcp/tools/organizations/organization-mcp.registrar';
import { ProjectMcpRegistrar } from '@/mcp/tools/projects/project-mcp.registrar';
import { WikiMcpRegistrar } from '@/mcp/tools/wiki/wiki-mcp.registrar';
import { McpAccessModule } from '@/mcp-access/mcp-access.module';
import { OrganizationsModule } from '@/organizations/organizations.module';
import { ProjectsModule } from '@/projects/projects.module';
import { WikiModule } from '@/wiki/wiki.module';

@Module({
  imports: [
    CalendarModule,
    ChatModule,
    KnowledgeGraphReadModule,
    KnowledgeGraphSearchModule,
    McpAccessModule,
    OrganizationsModule,
    ProjectsModule,
    WikiModule,
  ],
  providers: [
    CalendarMcpRegistrar,
    ChatMcpRegistrar,
    KnowledgeGraphMcpRegistrar,
    McpKnowledgeScopeResolver,
    McpToolAuthorizationService,
    McpToolRegistryService,
    OrganizationMcpRegistrar,
    ProjectMcpRegistrar,
    WikiMcpRegistrar,
  ],
  exports: [McpToolRegistryService],
})
export class McpToolsModule {}
