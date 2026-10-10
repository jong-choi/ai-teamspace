import { Redirect } from 'expo-router';

// 이전 주소다. 외부 MCP 연결은 AI 권한 탭 안으로 옮겼다.
export default function LegacyAgentIntegrationsPage() {
  return <Redirect href="/settings/mcp" />;
}
