import { AgentIntegrationsRoute } from '@core/features/agent-integrations/agent-integrations-route';
import { openAgentMcpAuthorization } from '@/lib/agent-integrations-oauth';

export default function AgentIntegrationsPage() {
  return (
    <AgentIntegrationsRoute openAuthorization={openAgentMcpAuthorization} />
  );
}
