# AGENTS.md

## git과 커밋

- 커밋은 사용자가 명확히 요청할 때에만 수행한다. 변경 완료를 이유로 임의 commit하지 않는다.
- 커밋 메시지는 Conventional Commits 형태를 사용한다.
- 커밋 제목과 본문은 항상 한글로 작성한다. Conventional Commits의 `type`과 `scope` 식별자는 영문을 유지한다.
- 코드 주석은 항상 한글로 작성한다. 외부 고유명사, API 이름, 식별자, 코드 조각은 원문 표기를 유지할 수 있다.
- 테스트 설명 문자열은 항상 한글로 작성한다. `describe`, `it`, `test`의 설명과 테스트 케이스 제목을 영문으로 작성하지 않는다.

```text
<type>(optional-scope): 변경 요약

- 주요 변경 사항 1
- 주요 변경 사항 2
- 검증 또는 후속 반영 사항
```

- 기본 type은 `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `perf`, `style`을 사용한다.
- scope는 변경 범위가 명확할 때만 붙인다. 예시는 `client`, `server`, `web`, `native`, `desktop`, `api`, `db`, `ci`다.
- 관련 없는 파일을 정리하거나 포맷하지 않는다.
- 다른 작업자의 변경을 임의로 되돌리거나 덮어쓰지 않는다.

## 저장소와 문서 경로

- 이 Git 저장소 밖의 파일이나 다른 로컬 저장소를 런타임, 빌드, 테스트, 문서의 전제로 사용하지 않는다.
- 문서와 코드에 로컬 절대경로를 남기지 않는다.

```text
/home/<user>/...
/Users/<user>/...
C:\Users\<user>\...
file://...
```

- 저장소 내부 파일 링크는 상대경로를 사용한다.
- 외부 프로젝트를 참고하더라도 그 프로젝트의 로컬 경로를 문서에 기록하지 않는다.
- secret, 개인 계정 정보, private token, 로컬 credential을 문서나 예제 코드에 남기지 않는다.

## 모노레포 도구와 포맷팅

- 루트 workspace에서 server, client 공용 package, 제품 package, 플랫폼 app을 함께 관리한다.
- package manager는 저장소에 설정된 package manager와 lockfile을 따른다. 임의로 package manager를 변경하지 않는다.
- 기존 workspace 도구가 있으면 루트 스크립트를 우선 사용한다.
- formatter는 저장소에서 정한 formatter 하나로 통일한다. 별도 formatter를 추가하지 않는다.
- import/export 정렬은 lint 설정을 따른다. formatter와 lint에서 같은 책임을 중복 관리하지 않는다.
- 직접 작성하는 source code의 module import는 가능한 한 alias 기반 절대경로를 사용하고 `./`, `../` 상대 import를 만들지 않는다.
- build output, generated source, codegen 산출물은 import 경로 정리, lint fix, format을 위한 수정 대상에서 제외한다.
- `client/packages/ui-kit/src/components/ui`의 React Native Reusables CLI 생성 컴포넌트와 `nativewind-env.d.ts`, `expo-env.d.ts`는 lint fix와 format 대상에서 제외한다. `globals.css`와 설정 파일은 저장소 관리 대상으로 유지한다.
- 루트 `format`, `lint`, `typecheck`, `test` 계열 스크립트가 있으면 개별 workspace 검증보다 우선한다.
- `build`는 정적 검증의 대체 수단으로 사용하지 않는다. 번들, native build, Electron package 결과 자체를 확인해야 할 때만 실행한다.
- framework와 주요 dependency version은 `package.json`과 lockfile을 기준으로 한다.
- 웹 문서의 최신 API를 현재 프로젝트에서도 사용할 수 있다고 가정하지 않는다. 설치 version을 확인한다.
- 사용자 요청 없이 framework나 주요 dependency의 major version을 올리지 않는다.

## 임시 파일과 작업 디렉터리

- 저장소 안에 임의로 `temp`, `tmp`, `scratch`, `backup`, `old`, `test-output` 같은 폴더를 만들지 않는다.
- 임시 산출물을 저장소 안에 남겨야 하면 프로젝트에서 정한 `.temp` 디렉터리를 사용한다.
- `.temp`를 사용하기 전에 gitignore 대상인지 확인한다.
- 실험용 코드나 일회성 변환 결과를 source directory에 남기지 않는다.

## 날짜와 시간

- 서버 timestamp 저장과 비교는 UTC를 기준으로 한다.
- 정확한 시각을 의미하는 API 값은 ISO datetime 문자열 등 명확한 wire format을 사용한다.
- 날짜만 의미하는 값과 timestamp를 구분한다.
- 필드 이름은 의미에 맞게 통일한다.

```text
...Date
...At
startAt
endAt
from
to
```

- HTTP request/response contract에 JavaScript `Date` instance를 직접 노출하지 않는다.
- `Map`, `Set`, class instance, DB driver object 등 JSON wire format과 맞지 않는 값을 API contract에 직접 사용하지 않는다.

## 환경 변수와 secret

- `.env.example`은 git으로 추적한다.
- 새 환경 변수가 추가되면 실제 secret 없이 key, 예시 값, 설명을 `.env.example`에 반영한다.
- `.env`, `.env.local`, `.env.*.local`과 실제 credential 파일은 git으로 추적하지 않는다.
- server secret을 client public environment variable로 전달하지 않는다.
- client environment variable에는 공개되어도 되는 값만 사용한다.
- 필수 환경 변수는 application 시작 시 schema로 검증한다.
- 필수 환경 변수가 없을 때 runtime 중간에서 조용히 fallback하지 않는다.

# client 구조

`client`는 전 제품 공용 package, 제품별 공용 코드, 플랫폼별 실행 app을 관리한다.

```text
client/
|-- packages/
|   |-- api-client/
|   |-- config/
|   |-- shared/
|   |-- testing/
|   `-- ui-kit/
`-- projects/
    `-- <project>/
        |-- apps/
        |   |-- expo/
        |   `-- desktop/
        `-- src/
            |-- app/
            |-- assets/
            |-- components/
            |-- config/
            |-- features/
            |-- hooks/
            |-- lib/
            |-- stores/
            |-- testing/
            |-- types/
            `-- utils/
```

- 실제 디렉터리명이 확정되면 이후 작업은 확정된 구조를 따른다.
- 제품 내부 Web, Native, Desktop에서 공유하는 코드는 `client/projects/<project>/src`에 둔다.
- 제품 간 공유하는 코드는 `client/packages`에 둔다.
- `apps/expo`는 Web, iOS, Android의 bootstrap, route entry, Expo 설정, 플랫폼 adapter만 둔다.
- `apps/desktop`은 Electron bootstrap, main/preload, desktop 설정, desktop adapter만 둔다.

## client package 책임

- `client/packages/ui-kit`는 전 제품 공통 UI primitive와 theme을 소유한다.
- 특정 제품의 업무 용어, API 상태, feature state를 직접 아는 component를 `ui-kit`에 넣지 않는다.
- `client/packages/shared`는 UI runtime에 의존하지 않는 전 제품 공통 코드를 소유한다.
- 특정 제품에서만 사용하는 코드는 `shared`로 올리지 않는다.
- `client/packages/api-client`는 서버 OpenAPI에서 생성한 API client, query hook, mutation hook, schema, type을 소유한다.
- `client/packages/config`는 여러 workspace가 실제로 공유하는 설정만 소유한다.
- 두 번째 실제 소비자가 없는 코드를 미래 재사용을 이유로 공용 package로 올리지 않는다.

## 제품 core와 플랫폼 app

- 제품 기능의 기본 위치는 `client/projects/<project>/src/features/<feature>`다.
- screen content, route composition, feature component, form, validation, hook, product state, query/mutation composition, mapper, product configuration, 업무 UI 로직은 기본적으로 제품 `src`에 둔다.
- `apps/expo`, `apps/desktop`에는 제품 기능을 복사하지 않는다.
- 같은 제품 기능을 여러 플랫폼에서 사용하면 먼저 제품 `src`로 이동한다.

## route entry

플랫폼 route entry는 제품 route를 호출하는 얇은 파일로 유지한다.

```tsx
import { DashboardRoute } from '@core/features/dashboard';

export default function DashboardPage() {
  return <DashboardRoute />;
}
```

- route entry에서 API workflow, form logic, 대형 화면 구현, product state를 직접 작성하지 않는다.
- `apps/expo`에서 Web, iOS, Android가 동일한 route를 사용하면 화면 구현을 플랫폼별로 각각 만들지 않는다.

## 플랫폼별 코드

- 공통 구현을 기본으로 한다.
- 작은 스타일 또는 behavior 차이는 `Platform.select` 또는 작은 adapter로 처리한다.
- 구현 자체가 다른 경우 platform-specific file을 사용한다.

```text
feature.ts
feature.web.ts
feature.native.ts
feature.ios.ts
feature.android.ts
```

- platform-specific file은 가능한 한 동일한 export와 동일한 public contract를 제공한다.
- 하나의 큰 component에 `Platform.OS` 분기가 반복되면 platform adapter 또는 platform file로 분리한다.
- 공유율을 높이기 위해 서로 다른 플랫폼 UX를 하나의 거대한 component에 넣지 않는다.

## platform capability

- 제품 core에서 native SDK, Electron API, browser-only API를 직접 사용하는 것을 피한다.
- filesystem, file picker, share, clipboard, camera, biometric, push notification, deep link, OS information, desktop window, desktop shell, native permission은 adapter 경계로 분리한다.
- 공용 feature 전체를 플랫폼별로 복사하지 않는다.

# Expo Web과 React Native

- Web, iOS, Android는 `apps/expo` 하나에서 관리한다.
- Web과 Native에서 공유 가능한 UI는 React Native primitive를 기본으로 사용한다.

```text
View
Text
Pressable
ScrollView
TextInput
Image
```

- 공용 제품 코드에서 HTML DOM element를 직접 사용하지 않는다.
- Web 전용 DOM API는 `.web.tsx` 또는 web adapter에 둔다.
- Native 전용 API는 `.native.tsx`, `.ios.tsx`, `.android.tsx` 또는 native adapter에 둔다.
- Expo Router app directory에는 route entry와 root layout 등 framework entry 역할만 둔다.
- `apps/expo` 내부에서 Web용과 Native용 business component를 별도 사본으로 유지하지 않는다.

## Expo와 Metro

- Expo 기본 Metro 설정을 우선한다.
- `metro.config.*`에서 `watchFolders`, `nodeModulesPaths`, resolver, alias 등을 임의로 추가하지 않는다.
- monorepo resolution 문제를 component 복사나 dependency 중복 설치로 우회하지 않는다.
- React, React Native, Expo runtime과 native module의 중복 설치를 만들지 않는다.
- 공용 package가 native module에 직접 의존해야 하는 경우 `apps/expo`의 autolinking과 dependency ownership을 확인한다.
- native dependency는 `apps/expo` 또는 명확한 native adapter package가 소유하는 것을 우선한다.
- Metro, Babel, Expo config를 수정할 때 Web과 Native 소비처를 함께 확인한다.

# React Native Reusables와 UI kit

- UI component를 새로 작성하기 전에 기존 `ui-kit`, React Native Reusables, 기존 primitive 조합 순서로 확인한다.
- React Native Reusables에서 제공하는 component를 이유 없이 별도 custom implementation으로 다시 만들지 않는다.
- RNR CLI로 설치된 component는 저장소가 소유하는 source code로 관리한다.
- 설치된 source는 프로젝트의 formatter, lint, accessibility, type 규칙을 따른다.
- CLI 실행 결과가 잘못되면 생성 파일을 즉시 대체 구현하지 말고 CLI version, config, registry, path 설정을 먼저 확인한다.
- 공용 UI component는 특정 제품 API나 product store에 의존하지 않는다.

## NativeWind

- shared UI와 제품 `src`가 모두 NativeWind scan 대상에 포함되도록 유지한다.
- Tailwind content/source, global CSS entry, NativeWind config, Metro config, Babel config, workspace source path를 서로 독립적으로 수정하지 않는다.
- 공용 package style이 누락된 경우 component를 app directory로 복사하지 않는다.
- scan path와 bundler resolution을 먼저 수정한다.
- Web 전용 selector나 pseudo state는 필요한 범위에서 `Platform.select` 또는 `.web` implementation으로 제한한다.

# Electron

- Electron은 별도의 desktop shell로 관리한다.
- 제품 renderer 코드는 가능한 한 Web과 동일한 product core와 UI code를 사용한다.

```text
Electron main
    | IPC
Electron preload
    | typed capability API
renderer
    |
product src
```

- Electron main process와 preload를 제품 feature 코드 안에 넣지 않는다.

## Electron renderer

- renderer와 제품 core에서 `electron/ipcRenderer`, `electron/shell`, `node:fs`, `node:child_process`, `node:worker_threads`를 직접 import하지 않는다.
- Node 또는 Electron capability는 preload를 통해 제한된 API로 노출한다.

## Electron preload

- `contextBridge`에는 기능 단위 API만 노출한다.
- raw `ipcRenderer`를 renderer에 전달하지 않는다.

```ts
contextBridge.exposeInMainWorld('desktop', {
  openFile,
  saveFile,
  getAppVersion,
});
```

- renderer에서 IPC channel 이름을 직접 사용하지 않는다.
- IPC input은 main process에서 runtime validation한다.
- IPC handler는 renderer input을 신뢰하지 않는다.

## Electron 보안

- `contextIsolation`을 유지한다.
- `nodeIntegration`은 비활성 상태를 기본으로 한다.
- sandbox를 우선 사용한다.
- 개발 편의를 이유로 renderer에 Node 전체 권한을 노출하지 않는다.
- CSP와 navigation 제한을 유지한다.
- `openExternal`과 외부 navigation 대상은 검증한다.
- remote content를 privileged renderer에 임의로 로드하지 않는다.
- Electron security 관련 dependency update는 일반 cosmetic upgrade와 구분해서 처리한다.

# client import 경로

- client source import는 저장소에 정의된 alias 기반 절대경로를 사용한다.
- 깊은 `../../..` 상대경로로 package 또는 architecture boundary를 우회하지 않는다.
- 제품 core는 플랫폼 app 내부 경로를 import하지 않는다.
- 공용 package는 제품 package를 import하지 않는다.

```text
platform app
  -> product src
  -> shared packages
```

- 순환 dependency를 만들지 않는다.
- named export를 기본으로 한다.
- barrel export와 re-export는 최소화한다.
- 단일 구현을 다시 노출하기 위한 `index.ts`를 만들지 않는다.
- 같은 package 내부에서는 원본 module을 직접 import한다.
- `export * from ...` 형태의 wildcard re-export는 사용하지 않는다.
- package의 명시적인 공개 API 경계를 제공해야 하는 경우에만 제한적으로 re-export를 허용한다.
- default export는 Expo Router route 등 framework가 요구하는 entry에서만 사용한다.

# client API 계약과 OpenAPI

- 클라이언트 API 계약의 원본은 서버 OpenAPI다.
- 서버 API 계약은 generated client를 통해 소비한다.

```text
server contract
-> OpenAPI
-> generated API client
-> product feature
```

- API request type, response type, enum, schema를 feature에서 수동으로 복제하지 않는다.
- generated query hook과 mutation hook이 있으면 직접 fetch wrapper를 만들지 않는다.
- generated schema/type을 feature에서 동일한 이름으로 다시 선언하지 않는다.

## generated API 파일

- generated 파일은 직접 수정하지 않는다.
- 생성물이 틀린 경우 서버 application contract, OpenAPI generation, generator config, generator version을 수정한다.
- generated 파일 위에 compatibility type이나 fallback schema를 만들어 오류를 숨기지 않는다.
- API 변경 뒤에는 OpenAPI와 client generated 파일을 함께 갱신한다.

## generated 계약 검증

- generated 파일이 생성되었다는 이유만으로 계약이 정확하다고 판단하지 않는다.
- enum, nullable, optional, union, discriminator, `$ref`, nested schema, recursive schema, datetime, numeric constraint는 생성 결과를 확인한다.
- generator가 예상 contract를 `unknown`이나 과도하게 넓은 type으로 만든 경우 type assertion으로 덮지 않는다.
- 중요 contract에는 생성 결과 또는 runtime schema를 검증하는 테스트를 둔다.

# React Query

- 서버 데이터는 React Query cache를 기준으로 관리한다.
- 서버 데이터를 Zustand 등 client global store에 복제하지 않는다.
- 조회는 generated query hook을 우선 사용한다.
- mutation은 generated mutation hook을 우선 사용한다.
- mutation 성공 후 invalidation은 관련 query key로 좁혀서 수행한다.
- 조회 오류를 feature 내부에서 임의 fallback state로 숨기지 않는다.
- Suspense를 사용하는 경우 ErrorBoundary와 Suspense boundary를 실제 query 소비처에 가깝게 둔다.

# 상태 관리

- 상태 관리 도구는 저장소에서 정한 하나의 방식을 따른다.
- global store에는 client-local shared state만 둔다.
- React Query server data, router가 소유하는 route state, form library가 소유하는 form state, component 하나에서만 쓰는 local state를 global store에 중복 저장하지 않는다.
- 같은 값을 여러 store에서 동시에 관리하지 않는다.

# 폼

- 폼은 저장소에서 정한 form library를 사용한다.
- request payload schema가 있으면 별도 validation schema를 처음부터 다시 만들지 않는다.
- 필요한 form schema는 canonical schema에서 `pick`, `omit`, `partial`, `extend`, `merge` 등으로 파생한다.
- API 전송 직전 canonical request schema로 다시 검증한다.
- form 전용 intermediate model이 필요한 경우 API contract와의 mapper를 명시적으로 둔다.

# server 헥사고날 아키텍처

server는 bounded context 기반 헥사고날 아키텍처를 사용한다.

```text
server/src/modules/<context>/
|-- <context>.module.ts
|-- application/
|   |-- contracts/
|   |-- ports/
|   |-- <workflow>.use-case.ts
|   `-- optional service
|-- domain/
|-- infrastructure/
|   |-- db/
|   |-- persistence/
|   |-- read-model/
|   `-- integrations/
`-- transport/
    `-- http/
        |-- dto/
        `-- <context>.controller.ts
```

- 새 module을 root에 controller, service, repository를 평면으로 배치하지 않는다.

## context module

- `<context>.module.ts`는 composition root 역할만 한다.
- 다른 Nest module import, controller 등록, provider 등록, port-adapter binding, 외부 provider export만 담당한다.
- module 파일에 business logic, DB query, DTO transformation, mapping, 조건 분기를 넣지 않는다.

## transport/http

- controller는 route, HTTP method, status code, guard, auth/session 추출, request/response DTO, application 호출만 담당한다.
- controller에서 DB를 직접 조회하지 않는다.
- controller에서 external SDK를 호출하지 않는다.
- controller에서 transaction을 시작하지 않는다.
- controller에서 복잡한 업무 조건을 판단하지 않는다.
- controller에서 API response object를 수동으로 조립하지 않는다.

## application

- application은 업무 입력 검증, 권한 의미 판단, workflow 순서, port 호출, not found, invalid state, conflict, transaction capability 호출, application contract 반환을 담당한다.
- application은 concrete infrastructure class를 import하지 않는다.
- Drizzle table, Drizzle service, DB connection, raw SQL, concrete repository, external SDK, HTTP controller, HTTP DTO에 직접 의존하지 않는다.

## application ports

- application이 외부 세계에 요구하는 capability는 `application/ports`에 정의한다.
- reader, writer, repository, file storage, mail provider, AI provider, payment provider, transaction manager 등이 해당한다.
- port input/output은 application/domain contract를 사용한다.
- DB row, HTTP DTO, SDK response type을 port contract로 사용하지 않는다.

## domain

- domain은 domain value, value object, domain schema, invariant, 순수 계산, 상태 전이 규칙을 소유한다.
- domain은 NestJS, Drizzle, database connection, HTTP, external SDK, filesystem, environment variable, application service, infrastructure adapter를 import하지 않는다.
- 단순 CRUD에 불필요한 domain abstraction을 억지로 추가하지 않는다.

## infrastructure

- infrastructure는 application port를 구현한다.
- `infrastructure/db`는 DB table, DB enum, DB relation, DB-derived schema를 소유한다.
- `infrastructure/persistence`는 저장, update, archive, lock, transaction, persistence mapper를 소유한다.
- `infrastructure/read-model`은 목록, 검색, join, aggregation, projection을 소유한다.
- `infrastructure/integrations`는 외부 API, storage, mail, payment, AI 등 외부 provider adapter를 소유한다.
- infrastructure에서 HTTP response shape를 만들지 않는다.

# bounded context 경계

- context A의 application이 context B의 concrete service나 repository를 직접 import하지 않는다.
- 다른 context의 데이터나 기능이 필요하면 소비 context가 필요한 capability를 port로 정의한다.

```text
orders/application
  -> CustomerLookupPort
  -> infrastructure adapter
  -> customer source
```

- bounded context 간 양방향 module dependency를 만들지 않는다.
- cross-context query가 필요한 경우 read-model adapter에서 필요한 projection을 구성한다.
- application service에서 여러 context의 concrete repository를 직접 조합하지 않는다.
- 공통 contract가 필요한 경우 독립적인 contract 또는 shared 영역을 사용하고 concrete service를 공유하지 않는다.

# reader와 writer

- 조회와 쓰기의 책임을 분리한다.
- 복잡한 목록, 검색, join, 통계, dashboard projection은 reader/read-model에 둔다.
- aggregate write, create, update, archive는 writer/repository에 둔다.
- 하나의 repository에 조회, 통계, 저장, 외부 연동을 모두 넣지 않는다.
- reader와 writer를 구현 파일만 나누고 하나의 거대한 통합 port를 유지하지 않는다.
- 업무상 동일 capability인 경우에만 하나의 port로 유지한다.

# use-case와 service

- use-case는 하나의 사용자 행동 또는 시스템 workflow를 기준으로 나눈다.
- 생성, 수정, 삭제, archive, connect, import, publish, execute가 서로 다른 변경 이유를 가지면 별도 use-case로 분리한다.
- 하나의 service에 CRUD, 통계, 외부 API 호출, 저장을 모두 넣지 않는다.
- service가 facade 역할을 할 수는 있지만 DB query나 HTTP response shape를 직접 다루지 않는다.

# mapper

- mapper는 표현 간 변환만 담당한다.

```text
DB row -> application model
application model -> persistence input
external provider response -> application model
```

- mapper에 DB query, 권한 판단, external API 호출, HTTP exception을 넣지 않는다.
- mapper 결과는 필요한 경우 canonical schema로 parse한다.

# server Drizzle SSOT

- 영속 구조의 단일 원본은 Drizzle table이다.
- field, enum, nullable, default, foreign key, unique constraint, index, relation 변경은 해당 context의 `infrastructure/db` Drizzle schema부터 수정한다.
- DB row, insert, update shape를 별도 `type`, `interface`, DTO class, `z.object`로 수동 복제하지 않는다.
- DB 조회와 변경은 Drizzle ORM query API로 작성한다.
- 일반 CRUD, filter, join, subquery, CTE, upsert, transaction을 raw SQL로 구현하지 않는다.
- `db.execute()`에 직접 SQL query를 전달하거나 `sql.raw()`를 사용하지 않는다.
- `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`, `WHERE`를 문자열 SQL 또는 tagged SQL query로 직접 작성하지 않는다.
- 조건과 projection은 `eq`, `and`, `or`, `inArray`, `exists`, `asc`, `desc`, `count` 등 설치된 Drizzle ORM API를 우선한다.
- Drizzle ORM API로 표현할 수 없는 기능이 필요해도 임의 raw SQL로 우회하지 않는다. schema 또는 query 설계를 먼저 재검토한다.
- 설치된 Drizzle version에서 제공하는 API를 사용하고 웹의 다른 version 문서를 보고 import path나 API를 임의 변경하지 않는다.

## DB-derived schema

- DB persistence validation schema는 `drizzle-zod`의 `createSelectSchema`, `createInsertSchema`, `createUpdateSchema`를 사용해 Drizzle table에서 파생한다.
- 현재 설치된 stable 계열에서는 별도 `drizzle-zod` package를 기준으로 하고, Drizzle v1 문서의 `drizzle-orm/zod` import를 그대로 적용하지 않는다.
- 영속 구조를 사용하는 application contract는 DB-derived schema에서 필요한 필드를 `pick`, `omit`, `extend`, `shape`, `merge` 등으로 파생한다.
- application contract에서 동일 DB field, enum, nullable 구조를 다시 선언하지 않는다.
- schema 파생은 허용하지만 use-case, service, port가 Drizzle table, Drizzle ORM, DB connection을 직접 import하지 않는다.

## JSON column

- JSON/JSONB column은 명시적인 소유 schema를 둔다.
- 느슨한 `unknown`, `any`, 검증 없는 `z.custom()`으로 JSON 구조를 우회하지 않는다.
- JSON 값은 read/write 경계에서 runtime validation한다.

# application contract

- application contract는 command, query, response와 업무 validation을 소유한다.
- DB-derived field는 DB schema에서 파생한다.
- DB에 없는 업무 구조는 application 또는 domain에서 독립적으로 정의할 수 있다.
- 교차 field validation은 application contract 또는 domain 규칙에서 처리한다.
- DB error 문자열에 의존해 업무 validation을 구현하지 않는다.

# DTO와 OpenAPI

- transport DTO는 application contract를 감싸는 얇은 layer로 작성한다.
- 가능하면 기존 Zod DTO 방식을 사용한다.
- DTO class에 동일 field를 수동으로 다시 선언하지 않는다.
- Swagger schema를 application contract와 별도로 손으로 복제하지 않는다.
- JSON success response는 실제 response contract에 연결한다.
- body가 없는 성공 응답은 명확한 no-content status를 사용한다.

# 서버-클라이언트 계약 흐름

```text
Drizzle table
-> DB-derived Zod schema
-> application contract
-> HTTP DTO
-> OpenAPI
-> generated client
```

- 같은 request/response/entity 구조를 중간에서 새로운 수동 SSOT로 만들지 않는다.
- 계약이 틀리면 파생 경로의 앞쪽 원본을 수정한다.
- generated client에 맞추기 위해 서버 contract를 assertion으로 위장하지 않는다.

# transaction

- transaction은 데이터 invariant와 workflow 원자성을 기준으로 사용한다.
- 화면에서 연속으로 실행된다는 이유만으로 서로 독립적인 작업을 하나의 transaction으로 묶지 않는다.
- controller에서 transaction을 관리하지 않는다.
- application에 raw DB transaction object를 노출하지 않는다.
- 하나의 persistence adapter 안에서 끝나는 transaction은 adapter가 관리할 수 있다.
- 여러 port가 하나의 atomic workflow에 참여해야 하는 경우 transaction/UoW capability를 명시적으로 설계한다.
- transaction abstraction을 모든 write에 기계적으로 적용하지 않는다.

# 동시성

- 사전 조회만으로 write 시점 상태가 보장된다고 가정하지 않는다.
- 필요한 경우 transaction, row lock, revision, optimistic concurrency, unique constraint, idempotency key를 사용한다.
- 중복 요청과 revision conflict를 구분한다.
- 오래된 revision을 최신 값으로 바꿔 자동 재전송하지 않는다.
- DB invariant가 필요한 경우 application validation만 두고 DB constraint를 생략하지 않는다.

# 에러 응답

- server error response는 프로젝트 전체에서 하나의 형식을 사용한다.
- validation, authentication, authorization, not found, conflict, external provider, internal error가 서로 다른 임의 JSON 구조로 나가지 않게 한다.
- repository와 infrastructure adapter는 HTTP response를 만들지 않는다.
- DB error와 provider error는 infrastructure에서 application 의미의 오류로 변환한다.
- application은 PostgreSQL code나 SDK error string에 직접 의존하지 않는다.
- transport/global error handling이 application error를 HTTP response로 변환한다.

# logging

- token, password, authorization header, cookie, secret, private key, raw credential, 민감한 개인정보, 결제 정보, 대용량 raw request/response를 로그에 남기지 않는다.
- 에러 추적에는 correlation id, operation, application error code, status, sanitized identifier 등 필요한 최소 정보만 남긴다.

# migration

- DB schema 변경 시 Drizzle schema를 먼저 수정하고 Drizzle Kit으로 migration을 생성한다.
- migration SQL을 직접 작성해 Drizzle schema와 별도 SSOT를 만들지 않는다.
- Drizzle Kit이 생성한 migration SQL은 generated artifact로 취급하고 임의로 포맷하거나 편의상 다시 작성하지 않는다.
- migration history를 임의로 수정하거나 기존 migration을 편의상 다시 쓰지 않는다.
- 가능한 경우 빈 DB에 전체 migration을 처음부터 적용하는 경로와 기존 DB에 새 migration을 이어서 적용하는 경로를 모두 확인한다.
- DB schema와 migration 결과가 다른 상태로 남지 않게 한다.

# 테스트

- application test는 port mock/stub을 사용해 workflow와 application rule을 검증한다.
- infrastructure test는 실제 query, mapper, transaction, constraint, persistence 동작을 검증한다.
- transport test는 route, status, guard, DTO, error mapping을 검증한다.
- client test는 사용자 동작, form, state transition, route, API 소비를 검증한다.
- Electron adapter test는 renderer에 raw privileged API가 노출되지 않는지 확인한다.
- 기존 테스트가 실패할 때 구현에 맞춰 테스트를 먼저 약화하거나 삭제하지 않는다.
- 실제 contract 변경인지 regression인지 확인한 뒤 수정한다.

# architecture 검사

- 중요 dependency rule은 가능한 경우 lint, test, architecture script로 자동 검증한다.
- server application의 DB 직접 import, server domain의 framework import, context 간 concrete service import, client product core의 platform app import, shared package의 product package import, Electron renderer의 Node/Electron privileged API import, generated source 직접 수정, duplicate React/React Native dependency를 검사 대상으로 둔다.
- architecture 검사 통과를 모든 설계 검증 완료로 해석하지 않는다.

# 검증

server 변경:

```text
format check
lint
typecheck
관련 unit test
관련 integration test
DB schema/migration check
OpenAPI generation
```

client 변경:

```text
format check
lint
typecheck
관련 unit/component test
API generated contract check
```

Web runtime 또는 bundler 변경:

```text
Web 실행 또는 export/build 검증
```

Native runtime 또는 native dependency 변경:

```text
Expo doctor
필요한 native/prebuild 검증
해당 플랫폼 실행 또는 build 검증
```

Electron 변경:

```text
main/preload/renderer typecheck
Electron runtime 검증
필요한 package/build 검증
```

- 검증하지 못한 항목이 있으면 작업 결과에 명시한다.

# 문서 작성

- 문서에는 현재 구조와 현재 규칙만 기록한다.
- 일회성 작업 과정이나 과거 변경 이력을 architecture rule에 섞지 않는다.
- 문서 내부 저장소 링크는 상대경로를 사용한다.
- 로컬 절대경로를 문서에 남기지 않는다.
- 새 architecture rule을 추가하면 실제 코드 구조와 검사 방법도 함께 맞춘다.
- 코드와 문서가 충돌하면 둘 중 하나를 방치하지 않는다.
