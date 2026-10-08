# 로컬 self-hosted Langfuse

Agent tracing과 eval harness linkage를 로컬에서 확인하기 위한 Langfuse v4 구성이다. 공식 [Docker Compose 배포](https://langfuse.com/self-hosting/deployment/docker-compose)를 기준으로 하며, 공식 문서대로 고가용성·확장·백업이 없어 운영 배포에는 쓰지 않는다.

## 구성

- `langfuse-web`, `langfuse-worker` 4.45.1, ClickHouse 26.4, PostgreSQL 17, Redis 7.2, MinIO
- image는 exact version(MinIO는 digest)으로 고정한다. 올릴 때는 [v3→v4 upgrade 문서](https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4)와 SDK 호환표를 먼저 확인한다.
- host에는 loopback(`127.0.0.1`)으로 Langfuse UI·API(`LANGFUSE_WEB_PORT`, 기본 3300)와 media upload용 MinIO API(`LANGFUSE_MINIO_PORT`, 기본 3390)만 연다.
- Langfuse 제품 telemetry는 끈다(`TELEMETRY_ENABLED=false`).
- 시작할 때 headless initialization으로 로컬 조직(`work-os-local`), 프로젝트(`work-os-agent`), 프로젝트 API key, 첫 사용자를 만든다. 이미 있으면 건너뛴다.

## 실행

저장소 루트에서 실행한다.

```sh
cp infra/langfuse/.env.example infra/langfuse/.env   # secret을 모두 채운다
docker compose -f infra/langfuse/compose.yaml up -d
curl http://127.0.0.1:3300/api/public/health
```

`docker compose`는 compose 파일과 같은 디렉터리의 `.env`를 읽는다. 비어 있는 secret이 있으면 시작하지 않는다. UI는 `http://localhost:3300`이고 `.env`의 `LANGFUSE_INIT_USER_EMAIL`/`LANGFUSE_INIT_USER_PASSWORD`로 로그인한다.

정지는 `docker compose -f infra/langfuse/compose.yaml down`, 데이터까지 지울 때는 `down -v`를 쓴다.

## 연결

| 소비자                            | 설정                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| server (`server/.env`)            | `LANGFUSE_ENABLED=true`, `LANGFUSE_BASE_URL=http://localhost:3300`, `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`에 init project key             |
| eval harness (`evals/agent/.env`) | `EVAL_LANGFUSE_ENABLED=true`, `EVAL_LANGFUSE_BASE_URL=http://localhost:3300`, `EVAL_LANGFUSE_PUBLIC_KEY`/`EVAL_LANGFUSE_SECRET_KEY`에 같은 key |

공식 권장 자원은 4 core, 16 GiB memory다. 이 구성은 그보다 작은 개발 머신에서도 뜨지만 PostgreSQL·Redis test container와 함께 돌리면 memory가 부족할 수 있다.
