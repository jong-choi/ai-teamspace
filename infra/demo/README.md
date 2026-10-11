# 데모 배포

기존 Nginx Proxy Manager가 HTTPS를 종료하고 `npm-network`의 `workos-demo-gateway:80`으로 전달한다. 앱 전용 Nginx는 Expo Web 정적 파일을 제공하고 `/backend/` 요청의 접두어를 제거해 Nest API로 전달한다. `/collaboration`은 위키 공동편집 WebSocket으로 전달한다. 외부 호스트 포트는 추가하지 않는다.

데모 전용 Compose project는 `workos-demo`다. PostgreSQL, Redis 3개, Neo4j, Garage와 API, jobs, 공동편집, gateway를 관리한다. Langfuse는 포함하지 않는다. 저장소 간 데이터를 공유하지 않고 이 project의 볼륨을 유지한다.

실제 설정은 Git에서 제외된 `.temp/deploy-demo/`의 `compose.env`, `server.env`, `seed.env`, `web.env`에 보관한다. 서버 설정의 원본 key 목록은 [서버 예시](../../server/.env.example), 시드 설정은 [시드 예시](../../demo/.env.example), Compose와 웹 설정은 [배포 예시](.env.example)를 따른다. 실제 공급자 key와 서버 secret은 웹 빌드로 전달하지 않는다.

배포는 서버와 웹 이미지를 순차 빌드한 뒤 데모 스택을 중지하고 데모 전용 데이터 볼륨을 삭제한다. 저장소 healthcheck, Drizzle migration, API·공동편집 시작, 실행일 기준 시드, jobs·gateway 시작 순서로 초기 상태를 만든다. 매 실행마다 PostgreSQL, Redis, Neo4j, Garage의 데모 데이터를 초기화하며 최초 시드 여부를 구분하지 않는다. 수동 배포·검증용 임시 스크립트는 `.temp/deploy-demo/`에만 두고 Git에 포함하지 않는다.

GitHub Environment 이름은 `demo`, 전용 러너 label은 `workos-demo`다. 배포와 데이터 초기화는 같은 Actions `concurrency` group을 사용해 동시에 실행되지 않게 한다. 초기화 동안 데모 서비스는 잠시 중단된다.

| GitHub Secret               | 내용                                         |
| --------------------------- | -------------------------------------------- |
| `DEMO_COMPOSE_ENV`          | PostgreSQL, Neo4j, Garage의 전용 credential  |
| `DEMO_SERVER_ENV`           | 서버 runtime 설정과 서버·공급자 secret       |
| `DEMO_SEED_ENV`             | 시드가 사용하는 전용 저장소와 데모 계정 설정 |
| `EXPO_PUBLIC_DEMO_PASSWORD` | 웹 번들에 포함되는 공개 데모 계정 비밀번호   |

GitHub Variables에는 `DEMO_DOMAIN`, `DEMO_DEPLOY_PATH`, `DEMO_RUNNER_LABEL`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DEMO_EMAIL`, `EXPO_PUBLIC_DEMO_ORGANIZATION_SLUG`를 기록한다. 실제 값의 로컬 기록은 `.temp/deploy-demo/settings.json`에 보관한다.

[데모 배포 워크플로](../../.github/workflows/demo.yml)는 `workflow_dispatch`로 직접 실행한다. `push`나 예약 이벤트로 새 코드를 배포하지 않는다. `demo` Environment의 허용 배포 branch는 `main`이다. 워크플로는 루트 format·lint·runtime·generated·typecheck와 관련 서버 단위 테스트를 통과한 뒤 이미지를 빌드한다. 배포 완료 시 공개 healthcheck·API·캘린더 응답을 확인한다.

[데모 데이터 초기화 워크플로](../../.github/workflows/demo-reset.yml)는 매일 한국시간 새벽 3시(UTC 18시)에 예약 실행하며 직접 실행도 가능하다. GitHub Actions의 예약 이벤트가 같은 VM 셀프호스티드 러너에서 초기화를 실행하고 별도 서버 cron이나 systemd 타이머는 사용하지 않는다. 현재 실행 중인 각 container의 immutable image ID를 확인한 뒤 같은 이미지로 저장소를 비우고 다시 시드한다. 새 소스의 빌드·이미지 다운로드는 하지 않는다. GitHub 예약 이벤트는 실행이 지연되거나 누락될 수 있어 정각 실행을 보장하지 않는다.

두 워크플로 모두 시드 직전에 `TZ=Asia/Seoul date +%F`로 기준일을 계산해 `DEMO_BASE_DATE`로 전달한다. 저장된 환경 파일에 과거 기준일이 남아 있어도 실제 초기화 실행일의 한국 날짜를 사용한다. 초기화 실패 시 워크플로는 실패 상태로 종료되며 수동 데모 배포를 다시 실행해 초기 상태를 복구할 수 있다.

Nginx Proxy Manager와 앱 Nginx의 요청 본문 한도는 100MiB, 큰 헤더 버퍼는 128KiB, proxy 송수신 유휴 시간은 한 시간이다. API·공동편집 Node 서버의 전체 요청 헤더 한도는 512KiB다. Nest JSON parser도 100MiB를 허용하며 MCP와 파일 업로드의 기능별 한도는 각 application contract가 적용한다. 공개 아바타 URL인 `/users/avatars/`는 API로 전달한다.
