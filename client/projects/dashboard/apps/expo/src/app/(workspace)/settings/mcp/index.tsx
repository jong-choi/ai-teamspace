import { McpAccessRoute } from '@core/features/mcp-access/mcp-access-route';
import { openAgentMcpAuthorization } from '@/lib/agent-integrations-oauth';

export default function McpSettingsPage() {
  return <McpAccessRoute openAuthorization={openAgentMcpAuthorization} />;
}
