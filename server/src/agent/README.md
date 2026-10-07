# WorkOS Agent integration

`server/src/agent`는 제품 소유 Agent feature다. generic Agent Protocol, durable queue/checkpoint/store, Nest transport는 `@repo/agent-runtime`가 소유하고 이 feature는 제품 정책과 external capability wiring만 소유한다.

## Structure

- `application/`: authorization policy와 WorkOS Agent definition/factory
- `domain/`: 제품 Agent가 공유하는 canonical actor contract
- `config/`: Agent 전용 environment schema와 parsed configuration
- `infrastructure/auth/`: Better Auth session을 Agent identity로 바꾸는 capability adapter
- `infrastructure/model/`: model set capability port와 configured adapter
- `infrastructure/mcp/`: actor-bound OAuth auth provider, MCP transport/session, approval policy
- `infrastructure/deep-agent/`: DeepAgents construction, protocol adaptation, session lifecycle
- `infrastructure/runtime/`: runtime actor mapping과 durable runtime options assembly
- `agent.module.ts`: composition root만 담당

## Identity and authorization

Better Auth 구현은 `BetterAuthAgentIdentityAdapter` 안에 격리한다. application의 `AgentAuthorizationPolicy`는 Better Auth를 알지 않고 `AgentIdentityProvider`만 사용해 Agent principal, thread ownership, assistant mutation prohibition, store namespace 정책을 만든다.

Agent runtime이 검증 뒤 넣은 `langgraph_auth_*` configurable만 `agent-actor.mapper.ts`가 `AgentActor`로 변환한다. 클라이언트가 reserved configurable을 직접 주입하는 경로를 제품 identity로 사용하지 않는다.

## MCP boundary

WorkOS business capability는 MCP `tools/list` 결과만 사용한다. organization/wiki/chat 등 WorkOS domain service나 Drizzle persistence를 Agent feature가 직접 import하거나 tool schema를 복제하지 않는다.

production MCP 인증 경계는 `WorkOsMcpAuthProviderFactory`다. `LangChainWorkOsMcpAdapter`는 server-verified `AgentActor`마다 `AuthProvider | OAuthClientProvider`를 새로 받아 MCP SDK의 `authProvider`에 직접 전달한다. 현재 composition은 mcp-03의 durable provider가 연결되기 전까지 `PendingFirstPartyWorkOsMcpAuthProviderFactory`가 실제 `OAuthClientProvider` shape를 제공하되 token/redirect/PKCE 사용을 fail-closed로 거부한다. `McpCredentialProvider`는 deterministic integration fixture의 legacy/test-only bearer seam으로만 남고 production default wiring에는 참여하지 않는다. 전역 superuser token, anonymous fallback, inbound Better Auth credential 재사용은 하지 않는다.

`LangChainWorkOsMcpAdapter`는 MCP transport, credential refresh, tool discovery와 session lifecycle을 소유한다. `McpToolApprovalPolicy`는 tool annotation의 `readOnlyHint: true`만 read-only로 인정하고 나머지 tool을 human approval interrupt 대상으로 분류한다.

## DeepAgent and protocol boundary

`DeepAgentBuilder`는 root/researcher/operator definition을 실제 model/tool set으로 조립한다. `DeepAgentWorkOsGraphAdapter`가 actor/model/MCP session과 DeepAgents SDK를 소유하고, application의 `WorkOsAgentFactory`는 generic `WorkOsAgentGraphProvider`를 실행 factory와 state resolver로 노출하는 역할만 한다.

`DeepAgentProtocolAdapter`는 strongly typed DeepAgent surface와 generic `AgentGraph` contract 사이의 명시적 adapter다. runtime-owned checkpointer/store는 `AgentGraph.bindRuntimeResources()` capability를 통해 연결하며 제품 코드에서 `as never`나 `as unknown as` assertion patch를 사용하지 않는다.

실행 graph와 state/history graph 생성 경로는 분리한다. 실행 graph만 authenticated actor와 MCP session을 요구하고, `AgentGraphFactory.resolveState()`가 state/history reconstruction용 side-effect-free graph를 제공한다. 따라서 fake `__state_read__` actor나 execution method override 없이 MCP outage 중에도 기존 checkpoint/state/history를 읽을 수 있다.

## Durability and lifecycle

`AgentRuntimeOptionsFactory`가 feature configuration, authorization policy, graph factory를 받아 `createDurableAgentRuntime()`을 조립한다. `AgentModule`은 이 options factory를 `AgentRuntimeModule.forRootAsync()`에 연결하는 composition root만 담당하며 env parsing, concrete adapter construction, queue/replay/dispose 설정을 직접 소유하지 않는다.

Runtime shutdown은 worker stop과 durable resource dispose를 모두 시도하고 실패를 로그에 남긴 뒤 호출자에게 다시 전파한다.

## HITL and SDK compatibility

Consequential MCP tool은 persisted interrupt로 멈추고 승인/거절/수정은 같은 thread의 새 run에서 `command.resume.decisions`로 이어간다. `DeepAgentProtocolAdapter`는 resume 직전 current checkpoint의 pending `actionRequests`와 decision 개수를 다시 binding하고, edit가 원래 interrupted tool name을 다른 tool identity로 바꾸지 못하게 검증한다. side effect는 이 검증을 통과한 resume run에서만 실행한다.

Pending HITL을 일반 turn이 덮어쓰지 않도록 run-create의 thread status precondition을 사용한다. React `useStream` remount/reconnect는 durable checkpoint와 resumable stream을 기준으로 최신 state/history를 다시 읽는다. Cancel은 Redis abort channel을 통해 실행 중 DeepAgent와 MCP HTTP `AbortSignal`까지 전달되어야 한다.

## Tests

- unit/integration test는 `server/src/agent/**/*.spec.ts`, `server/src/agent/**/*.integration.ts`
- `server/test/agent`는 Agent Protocol/Nest/React SDK E2E와 그 fixture/support만 소유
- build는 `*.spec.ts`, `*.integration.ts`를 제외한다
- MCP infrastructure integration은 protocol-only fixture를 사용하며 WorkOS 업무 schema를 로컬에 재구현하지 않는다
