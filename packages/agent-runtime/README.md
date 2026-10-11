# @repo/agent-runtime

AI Teamspace 서버에 Agent Protocol runtime을 embed하기 위한 내부 workspace package다.

이 package는 별도 deployable server가 아니다. 기존 Nest application이 `AgentRuntimeModule`을 import하고, 제품 영역의 graph/auth 구성을 `ProtocolDeps`로 주입한다. thread/run/assistant/store HTTP shape와 SSE 동작은 로컬 Agent Protocol 및 LangGraph SDK contract를 유지한다.

## Public API

- `AgentRuntimeModule`: 기존 Nest application에 Agent Protocol route를 middleware로 mount한다.
- `createInMemoryAgentRuntimeDeps`: 빠른 unit/test harness용 in-memory runtime을 구성한다.
- `createDurableAgentRuntime`: Postgres protocol store/checkpointer/thread gate와 Redis queue/replay/abort channel을 조립한다.
- `adaptAgentAuth`: stock `@langchain/langgraph-sdk/auth`의 `Auth`를 로컬 `AuthEngine`으로 변환한다.
- `AgentAuth`, `AgentHttpException`: 제품 auth adapter가 사용하는 stock LangGraph SDK auth API다.

## Boundary

이 package는 AI Teamspace organization/chat/wiki/calendar, Better Auth schema, 제품 permission enum을 알지 않는다. 제품 통합은 `server/src/agent`가 소유한다.

production `server/src/agent`는 `createDurableAgentRuntime`을 사용한다. protocol resource와 checkpoint는 전용 Agent PostgreSQL database에 저장하고, background run queue·SSE replay/live fan-out·cross-instance abort는 Agent 전용 Redis namespace를 사용한다. queue delivery는 at-least-once이며 동일 thread 실행은 Postgres session advisory lock으로 instance 간 직렬화한다.

shutdown은 Nest가 worker를 먼저 drain/abort한 뒤 runtime이 Redis/Postgres resource를 dispose하는 순서를 유지한다. Redis Stream replay는 bounded TTL/maxlen/subscriber buffer를 사용하고, close marker는 stream 만료 뒤 settled join이 무한 대기하지 않게 한다.
