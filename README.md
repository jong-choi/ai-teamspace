# Work OS

Expo와 Nest.js를 이용한 모노레포 구조의 앱 템플릿

## API 계약과 오류 처리

- Nest HTTP 오류는 `nest-problem-details-filter`의 RFC 9457 전역 필터로 통합하며 응답 media type은 `application/problem+json`이다.
- 업무/인증 오류 식별자는 `errorCode`, 검증 오류 목록은 `errors` 확장 필드로 제공한다. 서버 오류의 상세 메시지는 응답에 포함하지 않는다.
- Better Auth의 HTTP 정책은 custom plugin에서 관리한다. `onRequest`로 비활성 facade 경로를 차단하고 `onResponse`로 오류를 RFC 9457 규약에 맞추며 상태·쿠키·재시도 헤더를 보존한다. 내부 `auth.api` 오류는 provider adapter에서 application error로 변환한다.
- 조직 변경 API는 쿠키가 있는 요청의 `Origin` 또는 `Referer`를 Better Auth의 trusted origin 판정으로 검증한다. 브라우저 외 클라이언트도 쿠키 인증으로 변경 요청을 보낼 때 신뢰된 출처를 전달해야 한다.
- owner 강등·삭제는 서비스 정책과 Better Auth adapter의 조건부 mutation으로 보호한다. 사전 조회 이후 owner로 승격되어도 변경은 거절한다. Better Auth-owned 테이블을 Work OS에서 직접 변경하지 않는다.

## 생성과 검사

```sh
npm run api:generate
npm run check
npm test
```

`api:generate`는 Nest build에서 `server/dist/openapi.json`을 생성한 뒤 Orval로 [API client](client/packages/api-client/src/generated/work-os.ts), React Query hook, Zod schema를 함께 재생성한다. 필요하면 `OPENAPI_URL`로 다른 OpenAPI 입력을 지정할 수 있다. HTTP 오류는 generated `ProblemDetails` 계약으로 Promise rejection되고 네트워크·응답 검증 실패는 표준 `Error`로 전달된다. 성공 응답은 generated Zod schema로 검증하며 서버 주소와 Web/Native 인증 transport는 소비 app이 구성한다.

`check`는 포맷·아키텍처 lint·타입 검사 외에 다음을 확인한다.

- Better Auth CLI로 재생성한 auth schema와 저장된 schema 비교
- Expo autolinking verifier로 React/React Native 중복 설치 확인

생성물은 직접 수정하지 않는다. API 계약 변경 후 `api:generate`, Better Auth schema 설정 변경 후 `npm run db:generate --workspace @repo/server`를 실행한다.

실제 PostgreSQL/Redis를 사용하는 검증은 테스트 전용 환경 변수로 실행한다. 통합/E2E 테스트는 auth 데이터를 정리하므로 운영 DB를 사용하지 않는다.

```sh
npm run test:integration --workspace @repo/server
npm run test:e2e --workspace @repo/server
```
