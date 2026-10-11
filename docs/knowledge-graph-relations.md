# 그래프 투영의 원본 관계와 허용 범위

PostgreSQL 업무 원본과 현재 owner의 공개 조회 계약이 관계의 기준이다. Neo4j는 이 원본의 비동기 투영이다. 자연어 추론, 임의 이름 일치, 현재 그래프 membership으로 업무 관계나 권한을 확정하지 않는다.

## 원본과 투영 경계

| 관계                                 | 원본과 제약                                                          | 조직·삭제 정책                                                     | 투영 허용 범위                                                                              |
| ------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Project → Organization               | `project.organization_id` → Better Auth organization FK              | 필수, 조직 삭제 cascade                                            | 실제 조직의 프로젝트만 원본으로 사용                                                        |
| Project → Lead / Creator             | nullable lead / 필수 creator → user FK                               | lead 삭제 set null, creator 삭제 restrict                          | 과거 작성·담당 사실; 현재 멤버 권한을 의미하지 않음                                         |
| ProjectColumn → Project              | `project_column.project_id` FK                                       | 필수, project 삭제 cascade                                         | Project owner가 column 속성과 연결을 소유                                                   |
| Ticket → Project                     | `(project_id, organization_id)` 복합 FK                              | 필수, project 삭제 cascade                                         | 해당 조직의 프로젝트 관계만 생성                                                            |
| Ticket → Column                      | `(column_id, project_id)` 복합 FK                                    | 필수, column 삭제 restrict                                         | 프로젝트 안의 column만 연결                                                                 |
| Ticket → Assignee / Reporter         | nullable assignee / 필수 reporter → user FK                          | assignee 삭제 set null, reporter 삭제 restrict                     | 과거 사용자 참조; 새로운 할당은 owner가 현재 멤버 검사                                      |
| Ticket ↔ Label                       | assignment `(ticket_id, label_id)` PK, 개별 FK                       | 중복 연결 차단, ticket/label 삭제 cascade                          | 동일 project만 허용; 아래 제한 필수                                                         |
| Ticket → Checklist → Item            | 각 단계 FK                                                           | 필수, 상위 삭제 cascade                                            | Ticket source에 속한 항목과 관계만 교체                                                     |
| Ticket → Comment → Author            | ticket/user FK                                                       | ticket 삭제 cascade, author 삭제 restrict                          | 댓글 원문을 구조 그래프에 복제하지 않음; 별도 활동 관계가 필요하면 owner 계약부터 추가      |
| WikiDocument → Collection            | `(collection_id, organization_id)` 복합 FK                           | 필수, collection 삭제 cascade                                      | 해당 조직 collection의 문서만 사용                                                          |
| WikiDocument → Parent                | `(parent_document_id, collection_id, organization_id)` 복합 FK       | nullable, parent 삭제 restrict, 직접 자기 참조 check               | 같은 scope의 부모만 생성; 간접 cycle은 owner 잠금으로 차단                                  |
| Wiki → Creator / Updater             | user FK                                                              | 필수, user 삭제 restrict                                           | 과거 작성자 사실과 현재 읽기 권한 분리                                                      |
| Meeting → Organization               | organization FK                                                      | 필수, organization 삭제 cascade                                    | 조직별 회의 원본                                                                            |
| Meeting → Project                    | nullable text field, 직접 FK 없음                                    | owner의 공개 Project 조회로 현재 조직의 활성 UUID 참조를 검사      | 현재 writer는 `projectReference` 속성만 저장하고 Project edge를 생성하지 않음               |
| Meeting → Room                       | `(meeting_room_id, organization_id)` 복합 FK                         | nullable, room 삭제 restrict                                       | 해당 조직 room만 연결; room 속성은 Meeting 버전으로 덮지 않음                               |
| Meeting → Recurrence                 | `(recurrence_series_id, organization_id)` 복합 FK                    | nullable, series 삭제 restrict; occurrence identity unique         | 동일 조직의 반복 일정 참조; Calendar Recurrence source가 공유 속성을 독립 버전으로 소유     |
| Meeting ↔ Attendee                   | `(meeting_id, user_id)` PK, meeting/user FK                          | meeting 삭제 cascade, user 삭제 restrict                           | pending/accepted/tentative/declined 상태를 구분; 제거는 연결 삭제                           |
| Membership → Organization / User     | Better Auth-generated FK                                             | 조직·사용자 삭제 cascade                                           | 공개 OrganizationProvider를 통해 읽는 현재 membership; 그래프를 인가 근거로 사용하지 않음   |
| CuratedNode → Organization / Actor   | organization/user FK                                                 | 조직 삭제 cascade, actor 삭제 restrict                             | curated 원본의 revision·삭제 상태와 별도 권한 검사                                          |
| CuratedEdge → Source / Target        | kind+UUID 식별, curated 종단만 generated UUID와 organization 복합 FK | curated 종단은 활성 node 잠금, AI Teamspace 종단은 공개 owner 잠금 | references는 같은 조직의 Wiki/Project/Ticket/Meeting 원본에 연결 가능; 나머지는 curated끼리 |
| Curated audit → Organization / Actor | organization/user FK                                                 | 조직 삭제 cascade, actor 삭제 restrict                             | actor·target·revision·digest를 보존; 변경 원본·Outbox와 같은 transaction                    |

## 동일 프로젝트 라벨 제한

TicketLabelAssignment의 두 FK는 ticket와 label의 존재만 보장한다. 같은 프로젝트에 속함을 DB가 보장하는 것으로 설명하지 않는다.

TicketLabel owner는 활성 Project/Ticket 잠금을 잡고 label.projectId를 확인한다. TicketProjectionSource의 조회도 label.projectId = ticket.projectId 조건을 적용한다. 실제 owner 테스트에서 같은 조직의 다른 프로젝트 및 다른 조직의 label 연결을 거부한다. 저수준 DB에 교차 프로젝트 assignment를 넣는 감사 테스트에서는 DB가 이를 허용하지만 공개 투영 source에는 이 label이 나타나지 않는다.

운영 데이터 감사에서 이런 assignment가 발견되면 원본을 정정할 때까지 해당 연결을 authoritative 관계로 사용하지 않는다. 이벤트를 발행하지 않는 임의 DB 수정은 지원되는 업무 변경 경로가 아니다. 추가 DB 제약이 필요하면 project scope key의 데이터 전환과 생성 migration을 별도 설계한다. 기존 row 삭제나 임의 NULL 기본값으로 정합성 검사를 통과시키지 않는다.

## Meeting의 Project 문자열

현재 서비스는 Project의 UUID를 문자열로 사용하며 project key/name으로 연결하지 않는다. Public ProjectReferenceRepository는 파생 Project ID schema로 입력을 확인해 잘못된 문자열을 UUID query에 전달하지 않는다. 같은 조직의 활성 Project만 선택하고, 캘린더 capability는 조회되지 않는 ID를 CalendarProjectNotFoundError로 변환한다.

현재 저장 column은 text이며 직접 FK가 없다. 잘못된 저수준 참조나 참조 대상 삭제를 DB가 차단한다고 주장하지 않는다. 실제 카탈로그·owner 테스트로 확인한 이 한계를 보존한다. Project edge를 추가하려면 현재 원본 존재와 조직 범위, 기존 데이터 정정, 삭제·재투영 정책을 함께 검증해야 한다. 문자열을 UUID로 바꾸는 것만으로 관계를 수락하지 않는다.

## 조회와 사용자 권한

Project/Ticket/Meeting의 관계 snapshot은 owner Drizzle adapter의 repeatable read transaction으로 읽는다. Wiki와 TicketLabel은 단일 조회다. KG가 다른 feature의 table이나 adapter를 직접 읽지 않고 공개 owner query service를 사용한다.

사용자 FK는 현재 조직 membership을 보장하지 않는다. lead/assignee/attendee 신규 지정은 현재 owner 서비스의 membership 검사를 거친다. 과거 작성자·탈퇴자의 업무 사실은 현재 membership과 분리한다. 공개 MembershipProjectionQuery는 Better Auth capability로 org/user/role을 조회하고 조직별 keyset cursor를 적용한다.

## 데이터 감사와 migration 적용

정비 전 시스템 카탈로그에서 FK·복합 column 순서·nullable·삭제 정책·unique/check/index 및 migration history를 확인한다. 기존 데이터에서는 최소한 다음 위반을 읽기 전용으로 집계한다.

- 존재하지 않는 조직을 가리키는 Project.
- Ticket의 organization/project 또는 column/project 불일치.
- ticket와 label의 project 불일치 또는 중복 assignment.
- Wiki의 collection/org 및 parent scope 불일치, 직접·간접 cycle.
- Meeting의 Room/Recurrence 조직 불일치, 해석되지 않는 Project 문자열.
- membership, attendee, curated endpoint의 존재·조직·중복 상태 불일치.

이상이 있으면 해당 원본의 그래프 활성화를 보류하고 데이터 소유자가 정정 계획을 세운다. 사용자 데이터 임의 삭제, 무조건 전체 backfill, 기본 조직 치환을 하지 않는다. 운영 DB에서 실행하지 않은 감사는 통과로 기록하지 않는다.

Project 조직 FK는 Drizzle schema 변경에서 공식 codegen으로 생성한 [0020 migration](../server/drizzle/0020_absent_iron_patriot.sql)에 있다. 기존 orphan가 있으면 FK 적용이 실패하며 기존 데이터가 자동 삭제되거나 변경되지 않는다. 적용 전 읽기 전용 감사 및 원본 정정을 완료한다. 새 제약의 rollback이 필요하면 owner schema를 수정하고 새로운 공식 migration을 생성한다. 기존 migration history나 생성 SQL을 수동 수정하지 않는다.

## 재현 가능한 관계 검사

빈 격리 PostgreSQL과 이전 migration이 적용된 DB에서 공식 db:migrate를 각각 실행한다. 테스트 환경 DATABASE_URL을 지정하고 다음 owner integration을 실행한다.

```sh
NODE_OPTIONS=--experimental-vm-modules npm exec --workspace @repo/server -- jest --config ./jest.config.integration.mjs --runInBand \
  src/projects/infrastructure/persistence/drizzle/project.repository.integration.ts \
  src/projects/infrastructure/persistence/drizzle/ticket-workflow.repository.integration.ts \
  src/wiki/infrastructure/persistence/drizzle/wiki.repository.integration.ts \
  src/calendar/infrastructure/persistence/drizzle/calendar.repository.integration.ts
```

Membership 공개 조회의 실통합은 `src/organizations/membership-projection-query.integration.ts`가 소유한다. 전용 PostgreSQL·Redis 주소와 BullMQ prefix를 지정해 실행한다. 이 검사는 실제 가입·초대·역할 변경·탈퇴 API를 사용하며 외부 LLM을 호출하지 않는다.

## P4 업무 source 투영과 공유 속성 소유권

Project source는 조직·작성자·담당자와 컬럼 연결을 소유한다. Ticket은 Project/Column/Label/User의 최소 참조만 생성하며 이들 공유 노드의 기존 속성과 삭제 상태를 변경하지 않는다. Label의 이름·색상은 ticket_label source가 소유한다. Checklist/Item은 Ticket aggregate의 snapshot 안에서 갱신하며 기존 소유 관계를 제거하고 현재 관계만 연결한다. Ticket 이동·보관으로 순서가 바뀐 sibling도 자기 desiredSeq와 Outbox를 같은 업무 transaction에서 기록한다.

Calendar의 공유 속성 owner는 meeting_room과 meeting_recurrence source다. Room과 Recurrence 각각 공개 owner query, 전용 persistence port, 전용 Drizzle adapter를 사용한다. 두 source는 별도 Neo4j marker/fence로 속성과 tombstone을 갱신한다. Meeting은 이들 공유 노드에 최소 placeholder와 연결만 만든다. 더 큰 Meeting 버전도 다른 source의 버전과 비교하거나 속성을 덮지 않는다. Room create/update, series create/update/split 및 빈 원본 series 삭제는 같은 PG transaction 안에서 원본·desiredSeq·Outbox를 처리한다. 분할 시 기존 series에 남아 iCalSequence/updatedAt이 바뀐 회의도 실제 ID마다 발행한다.

두 kind는 Outbox canonical text column의 TypeScript enum metadata에서 파생한다. 새 PostgreSQL enum이나 별도 테이블을 추가한 것이 아니다. 기존 8종 source에 이 둘을 더해 지원 source는 10종이다. 새 구조라며 임의 SQL migration을 작성하지 않는다.

Membership은 조직 생성과 초대 수락의 member-added public event도 전달한다. 실제 Better Auth 원본 commit 후 public event→Jobs bridge→PG desiredSeq/Outbox→KG worker 경로이며 Better Auth transaction과 bridge transaction이 하나라고 주장하지 않는다. 중간 의도 유실은 반영 완료된 membership의 현재 owner snapshot digest 관찰로 복구하고, 조직 삭제는 레지스트리 조직의 존재 확인과 tombstone 의도로 복구한다. 현재 KG worker는 pending source의 삭제 신호와 공개 owner 원본의 존재 여부가 다르면 현재 desiredSeq를 잠금/CAS로 확인해 새 버전과 Outbox를 기록한다. 오래된 탈퇴 관찰로 재가입한 membership을 삭제하거나, 사라진 membership의 stale changed 신호로 부활시키지 않는다. 그래프의 membership은 현재 인가 판단에 사용하지 않는다.

## PG 기준 투영 복구

`outbox_aggregate_version`은 desired/applied seq·삭제·적용 snapshot digest·재예약 횟수와 실패 상태를 소유한다. Redis는 실행 큐이며 복구의 기준이 아니다. 재예약은 같은 desired seq로 새 Outbox 의도를 기록하고, 원본 변경 및 확인된 membership 변경만 새 seq를 만든다.

- `pending`은 5분부터 최대 60분까지 증가하는 cooldown 뒤 재예약한다. `applying`은 10분, `retry_scheduled`는 BullMQ backoff와 처리 여유를 포함한 약 27분 정체 뒤에만 재예약한다. DB 시계와 행 잠금/SKIP LOCKED로 여러 Jobs가 작업을 분할한다.
- `failed`는 자동 재예약이나 중복 전달로 다시 처리하지 않는다. 새 owner 변경이 새 seq/pending으로 접수한다. 재예약 count만으로 pending을 failed로 바꾸지 않는다.
- `kg_reconciliation_scope`는 조직 발견, owner 초기 접수, membership 관찰, 조직 존재 확인의 cursor·lease를 소유한다. token과 DB 시계의 2분 lease를 같은 의도 기록 transaction에서 확인하고, 만료한 소유자는 cursor나 Outbox를 쓰지 못한다.
- owner 초기 접수는 조직과 종류별 id keyset을 사용한다. 기존 source의 seq를 늘리지 않는다. membership은 15분, 그 외 owner는 6시간마다 다음 순환을 시작한다.
- 상시 snapshot 관찰은 반영 완료된 membership만 대상으로 한다. pending 변경은 재예약이 처리한다. 삭제된 membership도 재가입 확인을 위해 관찰하며 원본 조회 실패는 다음 원본 진행을 막지 않는다.
- 조직 존재 확인은 레지스트리 조직 id를 기준으로 일괄 조회한 뒤 사라진 조직을 개별 재확인한다. missing 수가 배치의 20% 또는 최소 5개를 초과하면 tombstone을 멈추고 고정 anomaly 상태를 남긴다. 확인된 삭제만 source별 tombstone으로 처리하고 해당 조직 owner scope를 정리한다.

Jobs는 부팅 직후와 60초 간격으로 복구를 실행한다. 목적별 batch는 최대 100개, tick은 목적마다 최대 20회와 20초 반복 예산을 사용한다. 한 scope의 순차 처리는 lease 만료 전에 끝내고 완료한 지점까지 cursor를 남긴다. 다른 목적의 실패는 독립 작업을 멈추지 않는다. 통계에는 상태별 backlog·재예약 정체 count·pending age와 비민감 오류 코드만 남긴다.

Neo4j 데이터나 marker 유실은 상시 전수 repair로 처리하지 않는다. 관리자 rebuild와 failed 재시도 명령 API는 후속 운영 기능에서 이 PG 복구 경계를 확장한다. 조직 삭제도 source marker와 tombstone을 보존해 오래된 작업의 부활을 차단하며 전체 그래프 clear를 사용하지 않는다.

실제 원본/Jobs/Neo4j 검사는 `src/knowledge-graph/project-ticket-delivery.integration.ts`, `calendar-delivery.integration.ts`, `membership-delivery.integration.ts`가 소유한다. Neo4j 관계 교체·fence·shared source 검사는 `project-projection.integration.ts`, `ticket-projection.integration.ts`, `calendar-reference-projection.integration.ts`가 소유한다. 조직 삭제 검사는 격리 fixture의 조직 row cascade 후 전달된 이벤트를 처리하는 범위이며 운영 조직 삭제 API나 자동 복구 scheduler 전체를 검증했다는 뜻이 아니다.

이 원본 관계 검사가 성공해도 Outbox relay, Neo4j fencing, 모델 추출, API 인가 및 UI 검증이 완료된 것은 아니다. 각 후속 단계에서 해당 책임을 실제 실행으로 검증한다.

## 사용자 작성 그래프 원본과 권한

Curated 원본 쓰기는 현재 조직 owner/admin만 허용한다. Wiki 원본의 유효 조직 회원 쓰기 정책과 별개다. UI가 보낸 editable 값이나 Neo4j membership으로 판정하지 않는다. CuratedGraphService는 dedicated repository port에 위임하고 원본 저장·revision·감사·desiredSeq·Outbox를 하나의 PostgreSQL transaction으로 처리한다. 같은 값의 부분 수정은 원본 시각·revision·감사·Outbox를 늘리지 않는다. 기대 revision이 다르면 먼저 충돌을 반환한다.

DatabaseService의 명시적 runInTransaction은 adapter가 호출한 저장 workflow에서만 활성 transaction context를 만든다. 기존 db 및 다른 업무 transaction의 동작을 바꾸지 않는다. CuratedAccessProvider의 AI Teamspace adapter는 AuthMembershipLockService와 Wiki/Project/Calendar 공개 ReferenceLockQueryService를 호출한다. 각 owner의 전용 Drizzle adapter가 같은 연결에서 row lock을 잡으므로 별도 connection이나 raw transaction을 application service에 전달하지 않는다. 중첩 또는 종료된 context의 잠금 요청은 거부한다.

Auth persistence adapter는 Better Auth-generated user/organization/member를 읽고 user/org key-share 및 member share lock을 잡는다. 저장 중 역할 변경·탈퇴·삭제가 commit 뒤까지 기다리므로 사전 인가만 통과한 오래된 요청이 권한 변경 이후 저장되는 경합을 막는다. Better Auth-owned table 변경은 이 capability가 수행하지 않는다. 전용 Drizzle repository의 architecture 분류는 feature ownership을 포함하며 auth의 자기 generated 원본 조회만 허용한다. 다른 feature의 generated auth schema 직접 import는 계속 금지한다.

Node kind는 custom/concept/topic/technology/reference다. Predicate는 related_to/depends_on/contains/references다. Drizzle text enum metadata와 DB CHECK에서 파생하며 허용 목록을 다른 계약에 복제하지 않는다. HTML의 업무 category나 자유 문자열을 authoritative kind로 사용하지 않는다. properties는 bounded JSON 계약을 따른다.

| Predicate             | 허용 종단                                                         | 방향                | Self-loop |
| --------------------- | ----------------------------------------------------------------- | ------------------- | --------- |
| related_to            | curated ↔ curated                                                 | 방향 있음 또는 없음 | 금지      |
| depends_on / contains | curated ↔ curated                                                 | 방향 있음           | 금지      |
| references            | curated / Wiki / Project / Ticket / Meeting의 같은 조직 현재 원본 | 방향 있음           | 허용      |

Archived Project/Ticket과 cancelled Meeting은 삭제와 구분하므로 현재 존재하면 참조할 수 있다. 관계 create와 endpoint/predicate 수정 모두 owner capability로 재검증한다. Curated node 잠금과 AI Teamspace owner row share lock은 일정한 종단 순서로 획득한다. 활성 중복 관계는 domain 충돌이며 DB unique constraint가 동시 쓰기도 막는다. 무방향 종단은 저장 시 UUID 순서를 정규화하고 DB expression index가 역순도 같은 관계로 취급한다.

Curated node 삭제는 연결된 활성 curated 관계가 있으면 연결 수를 포함한 충돌을 반환한다. 자동 cascade를 수행하지 않는다. 관계를 먼저 명시적으로 삭제하면 node를 soft-delete하고 tombstone seq를 발행한다. UUID가 같아도 다른 kind의 원본 연결을 해당 node의 연결로 잘못 계산하지 않는다. Generic curated 수정·삭제는 curated 테이블만 대상으로 하며 Wiki/Project 같은 업무 원본은 해당 owner 명령으로만 변경한다.

AI Teamspace 종단에 물리 FK restrict를 붙여 일반 업무 삭제를 막지 않는다. 업무 원본 삭제 후에도 사용자 참조의 PG 감사 원본은 남을 수 있다. Neo4j 관계 쓰기는 자신의 marker와 정렬된 양끝 marker를 같은 query 안에서 잠그고, endpoint tombstone이면 관계·placeholder를 생성하지 않는다. Curated node tombstone은 연결된 curated 관계를 제거한다. 업무 재투영은 자신의 관계만 교체하므로 사용자 curated 관계와 다른 source의 속성을 보존한다. 현재 존재하지 않는 종단에 대한 최종 조회 필터와 원본 삭제 후 참조 reconciliation은 조회·복구 계층에서도 반드시 적용해야 한다.

Migration 0021은 generated curated endpoint FK와 무방향 활성 unique expression을 도입한다. 기존 단일 역순 관계는 허용하며 별도 순서 CHECK를 강제하지 않는다. 이미 양방향 중복 활성 rows가 있다면 index 생성은 실패해야 한다. 배포 전 데이터 감사를 수행하고 임의 삭제나 migration artifact 수정으로 숨기지 않는다. Enum CHECK의 DDL은 canonical 값에서 inlineParams로 생성해 실행용 매개변수가 migration SQL에 남지 않게 한다.

원본·잠금·rollback 검사는 `server/src/knowledge-graph/curated-graph.repository.integration.ts`, 실제 Neo4j fence와 원본 관계 공존 검사는 `curated-projection.integration.ts`, PG→Outbox→Redis→Jobs→Neo4j 전달과 worker 부재 후 수렴은 `curated-delivery.integration.ts`가 소유한다. HTTP/MCP 및 화면의 오류·permissions·연결 수 전달은 각 transport/UI 계층의 별도 책임이다.
