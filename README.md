# monorepo-erp

Expo와 Nest.js를 이용한 모노레포 구조의 앱 템플릿

## API 계약과 오류 처리

- Nest와 Better Auth의 HTTP 오류는 `@camcima/nestjs-rfc9457`의 `ProblemDetailsFactory`로 생성한다. 응답 media type은 `application/problem+json`이다.
- 업무/인증 오류 식별자는 `code`, 검증 오류 목록은 `errors` 확장 필드로 제공한다. 서버 오류의 상세 메시지는 응답에 포함하지 않는다.
- Better Auth 응답 플러그인은 상태·쿠키·재시도 헤더를 보존한다. 비활성 경로처럼 플러그인을 거치지 않는 응답은 최종 HTTP handler에서 같은 변환 함수를 사용한다. 내부 `auth.api` 오류는 provider adapter에서 application error로 변환한다.
- 조직 변경 API는 쿠키가 있는 요청의 `Origin` 또는 `Referer`를 Better Auth의 trusted origin 판정으로 검증한다. 브라우저 외 클라이언트도 쿠키 인증으로 변경 요청을 보낼 때 신뢰된 출처를 전달해야 한다.
- owner 강등·삭제는 서비스 정책과 Better Auth adapter의 조건부 mutation으로 보호한다. 사전 조회 이후 owner로 승격되어도 변경은 거절한다. Better Auth-owned 테이블을 Work OS에서 직접 변경하지 않는다.

## 생성과 검사

```sh
npm run api:generate
npm run check
npm test
```

`api:generate`는 실행 중인 서버의 `/openapi.json`을 Orval이 직접 읽어 [API client](client/packages/api-client/src/generated/work-os.ts)와 React Query hook을 생성한다. 기본 주소는 `http://127.0.0.1:3000/openapi.json`이며 필요하면 `OPENAPI_URL`로 바꿀 수 있다. 오류 응답은 Promise rejection으로 전달되며 `error.info`에 Problem Details, `error.status`에 HTTP 상태가 있다. 브라우저 요청은 쿠키를 포함한다. 서버 주소 및 플랫폼별 인증 구성은 소비 app이 제공한다.

`check`는 포맷·아키텍처 lint·타입 검사 외에 다음을 확인한다.

- Better Auth CLI로 재생성한 auth schema와 저장된 schema 비교
- Expo autolinking verifier로 React/React Native 중복 설치 확인

생성물은 직접 수정하지 않는다. API 계약 변경 후 `api:generate`, Better Auth schema 설정 변경 후 `npm run db:generate --workspace server`를 실행한다.

실제 PostgreSQL/Redis를 사용하는 검증은 테스트 전용 환경 변수로 실행한다. 통합/E2E 테스트는 auth 데이터를 정리하므로 운영 DB를 사용하지 않는다.

```sh
npm run test:integration --workspace server
npm run test:e2e --workspace server
```
