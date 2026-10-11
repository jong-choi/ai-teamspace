# 00. 시험 실행

데이터셋을 고정하기 직전에, 아무것도 고치지 않은 상태로 26개 케이스를 한 번 돌린 결과다. 하네스가 시드 환경에서 끝까지 도는지 확인하려던 실행이라 이후 회차와 똑같이 비교할 수는 없다.

- 한 번만 실행했다.
- `knowledge-incident-response`는 이 실행 뒤에 `wiki_search`로 찾아도 통과하도록 기준을 바꿨다. 아래 표는 바꾸기 전 기준이다. 바뀐 기준이면 통과는 19건이다.
- 승인 대기로 끝난 실행은 대화가 원본에 남지 않았다. 그래서 캘린더 쓰기 실패 다섯 건 중 네 건은 원인을 원본으로 확인하지 못했다.

## 요약

| 항목                              | 값                    |
| --------------------------------- | --------------------- |
| 통과                              | 18/26 (69%)           |
| 도구 오류 없이 성공으로 끝난 실행 | 12/26                 |
| 도구 호출 / 도구 오류             | 110회 / 24회          |
| AI Teamspace 도구가 아닌 호출     | `grep` 38회, `ls` 3회 |
| 입력 토큰 합계                    | 1,475,011             |
| 첫 모델 호출 입력 토큰 (중앙값)   | 4,303                 |
| MCP 도구 수                       | 26                    |
| 도구 설명 글자 수                 | 3,045                 |
| 입력 스키마 글자 수               | 19,255                |

## 케이스별 결과

| 케이스                      | 통과 | 도구 오류 | 도구 호출 | 모델 호출 | 걸린 시간(초) |
| --------------------------- | ---- | --------- | --------- | --------- | ------------- |
| smalltalk-no-tool           | O    | 0         | 0         | 1         | 4             |
| projects-list               | O    | 0         | 1         | 2         | 5             |
| project-progress            | O    | 0         | 1         | 2         | 14            |
| project-columns-from-screen | O    | 0         | 1         | 2         | 4             |
| ticket-read-by-title        | O    | 1         | 3         | 5         | 29            |
| wiki-find-and-read          | O    | 0         | 2         | 3         | 6             |
| wiki-read-from-screen       | O    | 0         | 1         | 2         | 4             |
| meetings-list-week          | O    | 1         | 1         | 3         | 8             |
| members-admins              | O    | 4         | 6         | 11        | 28            |
| chat-conversations-list     | O    | 0         | 1         | 2         | 9             |
| chat-messages-read          | X    | 7         | 7         | 10        | 36            |
| knowledge-refund-settlement | O    | 1         | 5         | 7         | 27            |
| knowledge-relations         | O    | 1         | 6         | 8         | 33            |
| knowledge-incident-response | X    | 0         | 3         | 4         | 11            |
| ticket-create-with-due      | X    | 1         | 3         | 5         | 14            |
| ticket-priority-update      | O    | 1         | 3         | 5         | 16            |
| ticket-move-to-review       | O    | 1         | 4         | 6         | 26            |
| wiki-create                 | O    | 0         | 1         | 2         | 5             |
| wiki-rename                 | O    | 0         | 2         | 3         | 5             |
| wiki-body-edit-unsupported  | O    | 0         | 4         | 5         | 21            |
| meeting-create              | X    | 0         | 2         | 6         | 24            |
| meeting-create-in-room      | X    | 0         | 7         | 12        | 50            |
| meeting-reschedule          | X    | 6         | 13        | 20        | 104           |
| meeting-cancel              | X    | 0         | 12        | 26        | 143           |
| meeting-rsvp                | X    | 0         | 19        | 25        | 63            |
| chat-send                   | O    | 0         | 2         | 3         | 7             |

통과한 케이스에도 오류가 섞여 있다. 하네스는 기대한 도구에서 난 오류만 실패로 치기 때문에, 다른 도구에서 헤맨 뒤 맞는 도구를 부른 실행은 통과로 잡힌다.

## 도구 오류 24건

| 도구                        | 건수 | 오류                      |
| --------------------------- | ---- | ------------------------- |
| `knowledge_search`          | 6    | 입력이 스키마와 맞지 않음 |
| `calendar_meetings_list`    | 6    | 입력이 스키마와 맞지 않음 |
| `chat_messages_list`        | 5    | `CHAT_INVALID_CURSOR`     |
| `organization_members_list` | 4    | 입력이 스키마와 맞지 않음 |
| `chat_messages_list`        | 2    | 입력이 스키마와 맞지 않음 |
| `project_ticket_create`     | 1    | 입력이 스키마와 맞지 않음 |

스키마 불일치 19건은 모두 `Received tool input did not match expected schema`라는 같은 문구로 돌아왔다. 어느 인자가 왜 틀렸는지 알려 주지 않는다.

## 원본에서 확인한 원인

- 선택 인자를 빈 문자열로 채운다. `organization_members_list`에 `search: ""`, `calendar_meetings_list`에 `category: ""`와 `projectId: ""`를 넣었고, 최소 길이 1 제약에 걸려 거부됐다. 모델은 원인을 몰라 멀쩡한 `role` 값을 `ADMIN`, `owner`, `member`로 바꿔 가며 네 번 실패했다.
- 없는 enum 값을 지어낸다. `knowledge_search`의 `mode`에 `default`를, `calendar_meetings_list`의 `category`에 `meeting`을 넣었다.
- `chat_messages_list`의 `before`가 무엇인지 모른다. 날짜, 빈 문자열, 대화 ID, `"null"`, `"0"`을 차례로 넣어 일곱 번 실패한 뒤 인자를 빼고 성공했다.
- 티켓 마감일을 `+09:00` 오프셋으로 보냈다. 티켓 도구는 `Z`로 끝나는 시각만 받는다.
- 오류를 받으면 파일 검색 도구 `grep`으로 도구 이름을 찾으려 한다. 에이전트에게 주어진 파일 시스템에는 아무것도 없어서 매번 헛돈다.
- 티켓 목록 도구가 없어 `knowledge_search`의 제목 일치 결과로 티켓 ID를 찾는다. 찾기는 했지만 호출이 세 번 더 든다.
- 회의 일정 변경 한 건에 `calendar_meetings_list`를 열네 번 불렀다. 그중 다섯 번이 스키마 오류였다.

## 응답 품질

- `knowledge-incident-response`는 `wiki_search`로 문서를 찾아 장애 대응 순서를 문서 내용대로 답했다.
- 나머지 케이스의 답변 충실도는 이 실행에서 따로 판정하지 않았다. 측정 1부터 판정한다.
