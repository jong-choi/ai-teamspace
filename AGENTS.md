# AGENTS.md

- 이 문서의 지시사항을 따르며, 이 문서는 사용자의 명시적인 지시가 있을 때에만 업데이트 한다.
- Drizzle, Orval 생성물을 SSOT로 하며, 절대로 새로운 타입을 선언하지 않고 Drizzle, Orval로부터 파생된 스키마와 타입만을 사용한다.

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
- formatter는 Prettier로 통일한다. 별도 formatter를 추가하지 않는다.
- import/export 정렬은 lint 설정을 따른다. formatter와 lint에서 같은 책임을 중복 관리하지 않는다.
- 직접 작성하는 source code의 module import는 가능한 한 alias 기반 절대경로를 사용한다. `client/packages`는 `@repo/client/<package>/*`, RNR은 `@repo/client/rnr/components/ui/*`를 사용하고 `./`, `../` 상대 import를 만들지 않는다.
- repo 내부 workspace package와 authored import namespace는 `@repo/*` 체계로 통일한다.
- build output, generated source, codegen 산출물은 import 경로 정리, lint fix, format을 위한 수정 대상에서 제외한다.
- `client/packages/rnr/src/components/ui`의 React Native Reusables CLI 생성 컴포넌트와 `nativewind-env.d.ts`, `expo-env.d.ts`는 lint fix와 format 대상에서 제외한다. `globals.css`와 설정 파일은 저장소 관리 대상으로 유지한다.
- 루트 `format`, `lint`, `typecheck`, `test` 계열 스크립트가 있으면 개별 workspace 검증보다 우선한다.
- `build`는 정적 검증의 대체 수단으로 사용하지 않는다. 번들, native build, Electron package 결과 자체를 확인해야 할 때만 실행한다.
- framework와 주요 dependency version은 `package.json`과 lockfile을 기준으로 한다.
- 웹 문서의 최신 API를 현재 프로젝트에서도 사용할 수 있다고 가정하지 않는다. 설치 version을 확인한다.
- 사용자 요청 없이 framework나 주요 dependency의 major version을 올리지 않는다.

## 임시 파일과 작업 디렉터리

- 저장소 안에 임의로 `temp`, `tmp`, `scratch`, `backup`, `old`, `test-output` 같은 폴더를 만들지 않는다.
- 임시 산출물을 저장소 안에 남겨야 하면 저장소 루트의 `.temp` 디렉터리만 사용한다.
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
|   `-- rnr/
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
- useEffect, useLayoutEffect의 사용은 최소화한다.

## client package 책임

- `client/packages/rnr`는 전 제품 공통 RNR UI primitive와 theme을 소유한다.
- 특정 제품의 업무 용어, API 상태, feature state를 직접 아는 component를 `rnr`에 넣지 않는다.
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

# React Native Reusables와 RNR package

- UI component를 새로 작성하기 전에 기존 `client/packages/rnr`, React Native Reusables, 기존 primitive 조합 순서로 확인한다.
- React Native Reusables에서 제공하는 component를 이유 없이 별도 custom implementation으로 다시 만들지 않는다.
- RNR CLI는 `client/projects/<project>/apps/expo`에서 실행하고 `components.json` alias를 통해 `client/packages/rnr`에 생성한다.
- 설치는 `npx @react-native-reusables/cli@latest add <component>`를 사용하며 생성 source는 수동 대체하지 않고 저장소가 소유한다.
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
- OpenAPI에서 생성 가능한 request/response schema는 Orval generated Zod를 runtime contract로 사용하고 feature에서 동일 schema/type guard를 다시 작성하지 않는다.
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
- 클라이언트 GET 조회는 Orval이 생성한 Suspense query hook을 기본으로 사용하며 일반 `useQuery` hook은 생성·사용하지 않는다.
- 조회는 generated query hook을 우선 사용한다.
- mutation은 generated mutation hook을 우선 사용한다.
- mutation 성공 후 invalidation은 관련 query key로 좁혀서 수행한다.
- 조회 오류를 feature 내부에서 임의 fallback state로 숨기지 않는다.
- Suspense를 사용하는 경우 ErrorBoundary와 Suspense boundary를 실제 query 소비처에 가깝게 둔다.
- mutation 오류는 ErrorBoundary로 올리지 않고 플랫폼 알림 경계에서 처리하며 Web은 Sonner, React Native는 RNR toast를 사용한다.
- query/render 오류는 가장 가까운 ErrorBoundary가 처리하고 retry는 QueryErrorResetBoundary와 resetErrorBoundary를 함께 사용하며 라우터 redirect 제어 흐름은 재throw한다.

# 상태 관리

- global state library를 도입할 때는 하나의 라이브러리로 통일하고 이 문서에 명시한다.
- global store에는 client-local shared state만 둔다.
- React Query server data, router가 소유하는 route state, form library가 소유하는 form state, component 하나에서만 쓰는 local state를 global store에 중복 저장하지 않는다.
- 같은 값을 여러 store에서 동시에 관리하지 않는다.

# 폼

- form library를 도입할 때는 하나의 라이브러리로 통일하고 이 문서에 명시한다.
- request payload schema가 있으면 별도 validation schema를 처음부터 다시 만들지 않는다.
- 필요한 form schema는 canonical schema에서 `pick`, `omit`, `partial`, `extend`, `merge` 등으로 파생한다.
- API 전송 직전 canonical request schema로 다시 검증한다.
- form 전용 intermediate model이 필요한 경우 API contract와의 mapper를 명시적으로 둔다.

# server 헥사고날 아키텍처

server는 feature 단위 수직 분할 구조를 사용한다. 각 feature가 domain, DTO, persistence port/adapter, controller, service, module을 한 디렉터리 안에서 소유한다. DB persistence adapter는 Drizzle을 사용하고, Drizzle table과 drizzle-zod를 통해 persistence schema와 파생 contract의 중복 선언을 피한다.

```text
server/src/<feature>/
|-- domain/
|   `-- <resource>.ts
|-- dto/
|   |-- <resource>.dto.ts
|   |-- create-<resource>.dto.ts
|   |-- update-<resource>.dto.ts
|   `-- query-<feature>.dto.ts
|-- infrastructure/
|   |-- persistence/
|   |   |-- <resource>.repository.ts
|   |   `-- drizzle/
|   |       |-- schema/
|   |       |   |-- <resource>.schema.ts
|   |       |   `-- <resource>.zod.ts
|   |       |-- mappers/
|   |       |   `-- <resource>.mapper.ts
|   |       |-- repositories/
|   |       |   `-- <resource>.repository.ts
|   |       `-- drizzle-persistence.module.ts
|   `-- <capability>/
|       |-- <capability>.provider.ts
|       `-- <provider>/
|           |-- <provider>.adapter.ts
|           `-- <provider>.module.ts
|-- <feature>.controller.ts
|-- <feature>.service.ts
`-- <feature>.module.ts
```

- DB-backed feature를 새로 만들 때 위 구조를 그대로 만든다.
- `domain`, DTO 세트, persistence port, Drizzle schema/Zod, mapper, Drizzle repository, persistence module, controller, service, feature module을 baseline으로 둔다.
- 하나의 feature가 여러 persistence resource를 소유하면 각 resource마다 domain model, Drizzle schema/Zod, mapper를 두고 feature 목적에 맞는 repository port로 묶는다.
- feature별 controller/service/repository를 서버 전역 `controllers`, `services`, `repositories` 폴더로 모으지 않는다.
- 추가 helper/service가 생겨도 이 baseline 구조를 대체하지 않는다.

## 정석 구현 우선 원칙

- architecture, type, generated contract, dependency 문제를 `as`, `unknown` 우회, lint disable, architecture 예외 추가, 임시 re-export, raw SQL, generated 파일 직접 수정으로 덮지 않는다.
- 정적 검사가 설계 위반을 잡으면 검사를 약화하거나 예외 처리하기 전에 dependency ownership, port 위치, adapter 경계, package version/topology, canonical schema 파생 구조를 먼저 고친다.
- 같은 개념의 schema/type/provider를 경계마다 복제해서 컴파일만 맞추지 않는다. 소유 feature와 SSOT를 정하고 파생 또는 명시적 port/mapper로 연결한다.
- 다른 feature의 내부 table, generated schema, repository, adapter를 소비 feature가 직접 import하지 않는다. 필요한 기능은 소유 feature의 public application service 또는 소비 feature가 소유한 capability port와 정식 adapter 경계를 통해 사용한다.
- package version 충돌이나 duplicate dependency 때문에 canonical schema 파생이 깨지면 assertion으로 봉합하지 않고 dependency topology를 먼저 정상화한다.
- repository port에는 application service가 실제 사용하는 capability만 노출한다. adapter 내부 helper를 port로 끌어올리거나 범용 CRUD 인터페이스로 넓히지 않는다.
- 구현이 동작하더라도 root architecture/lint/typecheck가 실패하면 완료로 판단하지 않는다. feature-local 검사만 통과한 상태를 전체 품질 검증으로 해석하지 않는다.
- AGENTS 규칙과 현재 구현이 충돌하면 기존 구현을 관성적으로 유지하지 말고 규칙에 맞는 정식 구조로 리팩터링한다. 규칙 자체를 바꿔야 하는 경우에는 단순히 현재 코드를 통과시키기 위한 예외가 아니라 저장소 전체에 적용 가능한 architecture 근거가 있어야 한다.

## feature module

- `<feature>.module.ts`는 해당 feature의 composition root다.
- Drizzle persistence module과 feature가 사용하는 external capability module을 import한다.
- feature controller를 `controllers`, feature service를 `providers`에 등록한다.
- 다른 feature가 이 feature의 public service를 사용하면 service를 export한다.
- module 파일에 business logic, DB query, DTO transformation, mapping, 조건 분기를 넣지 않는다.

## controller

- `<feature>.controller.ts`는 feature root에 둔다.
- controller는 route, HTTP method/status, guard, auth/session 추출, DTO validation, service 호출을 담당한다.
- controller에서 Drizzle query, external SDK 호출, transaction, 복잡한 업무 조건 판단을 하지 않는다.
- request는 `dto/`의 DTO를 받고 response는 domain/response DTO contract를 사용한다.

## service

- `<feature>.service.ts`는 feature root에 두고 해당 feature의 CRUD와 업무 workflow를 담당한다.
- service constructor는 `infrastructure/persistence/<resource>.repository.ts`의 repository port와 external capability port를 주입받는다.
- service는 concrete Drizzle repository, Drizzle DB connection, Better Auth/S3 SDK 구현체를 import하지 않는다.
- service에서 raw SQL, Drizzle DB connection, SDK client를 직접 사용하지 않는다.
- service method의 입력과 출력은 `dto/`와 `domain/` contract를 사용한다.

## persistence port와 Drizzle adapter

- `infrastructure/persistence/<resource>.repository.ts`는 application service가 의존하는 persistence port를 정의하는 abstract class다.
- port method는 `create`, `findById`, `findByIds`, `findBy...`, `update`, `remove`처럼 feature가 실제로 사용하는 capability를 명시한다.
- 모든 조건을 받는 범용 `find(condition)` repository를 만들지 않는다.
- `infrastructure/persistence/drizzle/repositories/<resource>.repository.ts`는 port를 구현하는 Drizzle adapter다.
- repository와 adapter는 테이블 수나 파일 줄 수가 아니라 업무 capability와 aggregate/transaction 일관성 경계로 분리하며, 하나의 원자적 workflow는 한 repository method의 transaction 안에 유지한다.
- 분리한 persistence port는 각각 전용 concrete adapter에 `useClass`로 바인딩하고, 하나의 god adapter를 여러 port에 `useExisting`으로 노출하거나 adapter끼리 주입해 transaction 경계를 우회하지 않는다.
- Drizzle adapter만 DrizzleService, table, Drizzle query API를 사용한다.
- `drizzle-persistence.module.ts`는 `{ provide: <Resource>Repository, useClass: <Resource>DrizzleRepository }` 형태로 port와 adapter를 바인딩하고 port를 export한다.
- feature module은 repository 구현체가 아니라 `drizzle-persistence.module.ts`를 import한다.

## domain

- `domain/<resource>.ts`는 service와 repository port가 공유하는 canonical resource model을 제공한다.
- persistence field를 domain 파일에 다시 손으로 선언하지 않는다.
- 기본 resource model은 해당 resource의 drizzle-zod select schema에서 타입을 파생한다.
- business-only 상태, value object, 계산 규칙은 같은 `domain/`에 둔다.
- domain code에서 DB query, DB connection, external SDK를 호출하지 않는다.

## Drizzle schema, drizzle-zod, mapper

- `infrastructure/persistence/drizzle/schema/<resource>.schema.ts`의 Drizzle table 정의가 persistence contract의 유일한 SSOT다. DB column, enum, nullable, default, relation, index, constraint의 의미를 다른 schema/type에서 별도로 다시 선언하지 않는다.
- `<resource>.zod.ts`는 같은 Drizzle table에서 `createSelectSchema`, `createInsertSchema`, `createUpdateSchema`를 생성하는 파생 계층이다. persistence field를 별도 `z.object`로 다시 작성하는 방식으로 Drizzle table을 우회하지 않는다.
- `domain/<resource>.ts`, response DTO, create/update DTO는 이 파생 schema를 기준으로 `pick`, `omit`, `extend`, `partial` 등으로 만든다. HTTP 전용 field나 business-only field만 직접 추가할 수 있다.
- drizzle-zod와 application Zod가 서로 다른 runtime/type instance로 갈라지면 type assertion이나 schema 복제로 덮지 않는다. package dependency와 peer dependency를 정리해 같은 schema graph가 호환되는 Zod instance를 사용하도록 해결한다.
- generated schema가 있더라도 다른 feature가 해당 generated persistence implementation을 직접 import해서 FK나 domain contract를 만들지 않는다. cross-feature reference가 필요하면 해당 feature의 공개 persistence boundary나 독립된 reference contract를 둔다.
- `mappers/<resource>.mapper.ts`는 Drizzle row와 canonical domain model 사이의 persistence boundary다.
- 기본 `toDomain`은 select schema로 row를 parse하고, write mapping은 insert/update schema로 persistence input을 검증한다.
- mapper에 DB query, 권한 판단, HTTP exception, external API 호출을 넣지 않는다.

## DTO

- `dto/<resource>.dto.ts`는 select schema 기반 response DTO다.
- `dto/create-<resource>.dto.ts`는 insert schema에서 API가 받는 field만 `pick`, `omit`, `extend`하여 만든다.
- `dto/update-<resource>.dto.ts`는 update schema에서 파생한다.
- `dto/query-<feature>.dto.ts`는 pagination/filter/sort query contract를 소유한다.
- Zod contract는 `createZodDto`로 Nest DTO를 만든다.
- DB field, enum, nullable, default를 DTO property나 별도 `z.object`로 다시 복제하지 않는다.
- DTO에서 DB에 없는 HTTP/query 전용 field만 직접 정의한다.

## external capability port와 adapter

- database 외부 capability도 persistence와 같은 port/adapter 형태로 만든다.
- `infrastructure/<capability>/<capability>.provider.ts`에 abstract port를 둔다.
- `infrastructure/<capability>/<provider>/<provider>.adapter.ts`가 이를 구현한다.
- `<provider>.module.ts`가 `{ provide: <Capability>Provider, useClass: <Provider>Adapter }`로 바인딩하고 port를 export한다.
- Better Auth, S3, mail, payment, AI provider를 feature service에서 직접 import하지 않는다.

# feature 간 의존성

- 다른 feature의 persistence repository나 adapter를 직접 import하지 않는다.
- 다른 feature 기능이 필요하면 해당 feature가 export한 service를 module import를 통해 사용한다.
- 외부 provider 교체가 필요한 capability는 소비 feature 내부의 provider port/adapter로 감싼다.
- feature module 사이에 순환 의존성을 만들지 않는다.

# database composition

- 공통 Drizzle connection/configuration은 `server/src/database`가 소유한다.
- 각 feature의 table 정의는 해당 feature의 `infrastructure/persistence/drizzle/schema`가 소유한다.
- 중앙 schema aggregator는 feature schema를 import해 Drizzle connection과 Drizzle Kit에 제공하는 composition 파일이며 field를 다시 선언하지 않는다.
- migration은 `server/drizzle`에 생성한다.

# server Drizzle SSOT

- 영속 구조의 단일 원본은 각 feature가 소유하는 Drizzle table이다.
- field, enum, nullable, default, foreign key, unique constraint, index, relation 변경은 해당 feature의 `infrastructure/persistence/drizzle/schema`부터 수정한다.
- Drizzle table -> drizzle-zod -> domain/DTO contract 순으로 파생한다.
- DB row, insert, update shape를 별도 `type`, `interface`, DTO property, 수동 `z.object`로 다시 쓰지 않는다.
- DB 조회와 변경은 Drizzle ORM query API로 작성한다.
- 일반 CRUD, filter, join, subquery, CTE, upsert, transaction을 raw SQL로 구현하지 않는다.
- `db.execute()`에 직접 SQL query를 전달하거나 `sql.raw()`를 사용하지 않는다.
- `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`, `WHERE`를 문자열 SQL 또는 tagged SQL query로 직접 작성하지 않는다.
- 조건과 projection은 `eq`, `and`, `or`, `inArray`, `exists`, `asc`, `desc`, `count` 등 설치된 Drizzle ORM API를 우선한다.
- Drizzle ORM API로 표현할 수 없는 기능이 필요해도 임의 raw SQL로 우회하지 않고 schema/query 설계를 먼저 재검토한다.
- 설치된 Drizzle version의 API를 기준으로 하고 다른 major/RC 문서의 import path나 API를 임의 적용하지 않는다.

## Better Auth-owned schema

- Better Auth가 소유하는 `user`, `account`, `session`, `verification`, `organization`, `member`, `invitation` 등 auth schema는 직접 작성한 Drizzle table을 SSOT로 취급하지 않는다.
- Better Auth-owned schema의 상위 SSOT는 Better Auth config와 enabled plugin이다.
- `server/src/auth/infrastructure/persistence/drizzle/generated`의 auth Drizzle schema는 Better Auth CLI 생성물이며 수동 수정하지 않는다.
- Better Auth plugin이나 auth schema option을 변경하면 `npm run auth:schema`로 generated schema를 다시 만들고 `npm run db:generate`로 Drizzle migration을 생성한다.
- Better Auth-owned table과 Work OS-owned table은 동일 PostgreSQL과 동일 Drizzle connection을 사용하되 소유권 경계는 분리한다.
- Work OS table이 Better Auth-owned `user`를 DB foreign key로 참조해야 하면 `server/src/auth/infrastructure/persistence/drizzle/auth-user-reference.ts`가 노출하는 최소 schema reference만 사용한다. feature schema에서 generated auth schema를 직접 import하지 않는다.
- auth schema reference module은 foreign key 구성에 필요한 column reference만 노출하고 query, mutation, business logic, generated table 전체 re-export를 넣지 않는다.
- Work OS service/repository에서 `user`, `account`, `session`, `organization`, `member` 등 Better Auth-owned table을 직접 insert/update/delete하지 않는다.
- Better Auth-owned invariant를 변경하는 작업은 Better Auth API를 adapter/provider 경계를 통해 수행한다.
- auth generated schema와 `server/drizzle` migration 산출물은 formatter, lint fix, import sort 대상에서 제외한다.

## schema 파생 규칙

- DB persistence validation schema는 `drizzle-zod`의 `createSelectSchema`, `createInsertSchema`, `createUpdateSchema`로 Drizzle table에서 파생한다.
- Zod schema 생성에는 `drizzle-zod` package를 사용하며 `drizzle-orm/zod` import를 사용하지 않는다.
- domain resource type은 select schema에서 파생한다.
- create/update/response DTO schema는 insert/update/select schema에서 `pick`, `omit`, `partial`, `extend`, `merge`, `shape`로 파생한다.
- DB에 없는 query parameter와 업무 validation만 DTO/domain schema에서 추가한다.
- service와 repository port는 table/DB connection이 아니라 domain/DTO contract를 사용한다.

## JSON column

- JSON/JSONB column은 명시적인 소유 schema를 둔다.
- 느슨한 `unknown`, `any`, 검증 없는 `z.custom()`으로 JSON 구조를 우회하지 않는다.
- JSON 값은 read/write 경계에서 runtime validation한다.

# DTO와 OpenAPI

- Zod DTO는 drizzle-zod 파생 schema를 직접 감싸는 얇은 HTTP contract다.
- Swagger schema를 DTO contract와 별도로 손으로 복제하지 않는다.
- JSON success response는 실제 response DTO에 연결한다.
- body가 없는 성공 응답은 명확한 no-content status를 사용한다.

# 서버-클라이언트 계약 흐름

```text
Drizzle table
  |-> drizzle-zod -> domain model -> repository port/service
  |-> drizzle-zod -> Zod DTO -> controller -> OpenAPI -> Orval
  `-> Drizzle repository adapter -> repository port -> service
```

- 같은 request/response/entity 구조를 중간에 새로운 수동 SSOT로 만들지 않는다.
- 계약이 틀리면 파생 경로의 앞쪽 원본을 수정한다.
- generated client에 맞추기 위해 서버 contract를 assertion으로 위장하지 않는다.

# transaction

- transaction은 데이터 invariant와 workflow 원자성을 기준으로 사용한다.
- 화면에서 연속으로 실행된다는 이유만으로 서로 독립적인 작업을 하나의 transaction으로 묶지 않는다.
- controller에서 transaction을 관리하지 않는다.
- raw DB transaction object를 service/public contract로 노출하지 않는다.
- Drizzle transaction은 Drizzle repository adapter에서 관리한다.
- Better Auth와 Work OS가 같은 PostgreSQL/Drizzle connection을 사용해도 Better Auth-owned mutation을 Work OS transaction으로 직접 감싸지 않는다. Better Auth API 호출과 Work OS 상태 변경이 함께 필요한 workflow는 idempotency와 reconciliation을 설계한다.

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

- server unit test와 feature 범위 integration test는 해당 코드를 소유하는 `server/src/<feature>` 아래에 둔다.
- `server/test`는 E2E test 전용으로 사용하고 feature별 하위 디렉터리로 구성한다.
- Jest 공용 setup은 `server/jest.setup.ts`에서 관리한다.
- monorepo의 unit/integration test runner는 Jest를 기본으로 사용한다.
- Expo/React Native UI test는 `jest-expo`와 React Native Testing Library를 사용한다.

```text
server/
|-- src/<feature>/*.{spec,integration}.ts
|-- test/<feature>/*.e2e-spec.ts
`-- jest.setup.ts
```

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
