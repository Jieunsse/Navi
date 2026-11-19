# 공모 요구사항과 구현 근거

- 마지막 수정: 2026-11-19
- 한 줄 요약: 공모 체크리스트와 평가 기준마다 그것을 만족하는 코드, 서버 확인, 테스트, 명세, 확인 순서를 한 줄로 이었다.
- 이 문서의 위치: [문서 색인](README.md)
- 기능의 자세한 동작은 [07 기능 명세](07-feature-spec.md)가 기준이다. 시스템 구성과 흐름은 [14 설계](14-architecture.md)에 있다.

공모 요구사항 대조표는 이 문서에만 둔다. 07과 13에는 이 문서로 가는 링크만 있다. 기능마다 "이대로 되면 정상"인 심사 시나리오는 [07 10장](07-feature-spec.md#10-완료-기준과-심사-시나리오)에 있다.

"README 확인"은 [루트 README의 기능 확인 순서](../README.md#기능-확인-순서) 번호다. 코드 경로는 레포 루트 기준이다.

## 1. 필수 요구사항

### 1-1. PC 라이브 방송

| 체크리스트 | 구현한 곳 | 서버 확인과 테스트 | 명세 | README 확인 |
|---|---|---|---|---|
| PC 화면을 캡처해 실시간으로 송출한다 | `apps/web/app/studio/[id]/page.tsx`: `getDisplayMedia`로 화면을 받아 LiveKit에 화면 공유 트랙으로 올린다 | 송출 권한은 방송 주인에게만 준다(`packages/core/src/application/broadcast.ts`의 `publishToken`) | [07 4-4](07-feature-spec.md#4-4-송출-화면-pc-화면-공유) | 1번 |
| 탭 소리 또는 시스템 소리를 마이크와 함께 송출한다 | 같은 파일: 탭 소리는 화면 공유 소리 트랙, 마이크는 `getUserMedia`로 받은 마이크 트랙으로 따로 올린다. `apps/web/app/live/[id]/page.tsx`가 두 소리를 함께 재생한다 | 미리보기에 소리 막대 두 개를 보여 준다 | [07 4-4](07-feature-spec.md#4-4-송출-화면-pc-화면-공유)의 2~4번 | 1번의 2~5 |
| 시작과 종료 때 송출 연결을 만들고 끊는다 | 시작: 송출 권한 받기 → 방 연결 → 트랙 올리기 → 송출 확인. 종료: 서버 종료 요청 → 방 연결 끊기 → 장치 끄기(같은 파일의 `finish`) | 서버 `end`가 상태를 종료로 바꾸고 LiveKit 방을 닫아 모든 연결을 끊는다(`broadcast.ts`, `packages/core/src/adapters/livekit.ts`). 크롬 "공유 중지"도 종료로 이어진다 | [07 3장](07-feature-spec.md#3-방송-상태) | 1번의 4, 6, 7 |

### 1-2. 모바일 라이브 방송

| 체크리스트 | 구현한 곳 | 서버 확인과 테스트 | 명세 | README 확인 |
|---|---|---|---|---|
| 휴대폰 카메라와 마이크를 실시간으로 송출한다 | `apps/web/app/studio/[id]/page.tsx`: `getUserMedia`로 카메라(앞·뒤 바꾸기)와 마이크를 받아 올린다 | PC와 같은 송출 권한 확인을 거친다 | [07 4-5](07-feature-spec.md#4-5-송출-화면-휴대폰-카메라) | 2번 |
| 모바일에서 방송을 시작하고 종료한다 | 같은 송출 화면의 시작·종료 버튼. 화면이 꺼지지 않게 막고, 화면을 잠그면 종료한다 | 방송자 연결이 끊기면 LiveKit 웹훅으로 서버가 종료한다(`broadcast.ts`의 `onLiveKitEvent`) | [07 4-5](07-feature-spec.md#4-5-송출-화면-휴대폰-카메라) | 2번의 2, 4, 5 |

### 1-3. 방송 관리와 시청

| 체크리스트 | 구현한 곳 | 서버 확인과 테스트 | 명세 | README 확인 |
|---|---|---|---|---|
| 방송 정보를 등록, 조회, 수정, 삭제한다 | API: `apps/web/app/api/broadcasts/route.ts`(등록), `apps/web/app/api/broadcasts/[id]/route.ts`(조회, 수정, 삭제). 로직: `broadcast.ts`의 `create`, `get`, `update`, `remove`. 화면: `/studio/new`, `/studio` | 수정·삭제는 방송 주인만 된다. 방송 중인 방송은 지울 수 없다 | [07 4-3](07-feature-spec.md#4-3-방송-만들기), [4-10](07-feature-spec.md#4-10-내-방송-관리) | 3번의 1 |
| 목록과 상세 화면에서 골라 시청한다. PC와 모바일 방송을 다른 기기에서 본다 | 목록: `apps/web/app/page.tsx`, `apps/web/src/entities/broadcast/model.ts`. 상세와 재생: `apps/web/app/live/[id]/page.tsx` | 시청 권한은 로그인 없이 받지만 올리기와 데이터 보내기는 꺼져 있다(`broadcast.ts`의 `viewerToken`) | [07 4-2](07-feature-spec.md#4-2-홈방송-목록), [4-6](07-feature-spec.md#4-6-방송-보기) | 1번의 5, 2번의 3, 3번의 2 |
| 방송 중과 종료 상태를 나누고, 종료하면 송출을 멈춘다 | 상태는 준비, 방송 중, 종료 세 가지다. 화면은 Firestore 실시간 구독으로 새로고침 없이 바뀐다 | 종료하는 네 가지 길이 모두 서버 `end` 하나를 부른다. 같은 종료가 두 번 와도 한 번만 처리한다 | [07 3장](07-feature-spec.md#3-방송-상태), [14 3장](14-architecture.md#3-방송-상태) | 1번의 6, 3번의 3 |
| 방송 정보를 저장하고 서버를 다시 켜도 조회한다 | Firestore `broadcasts` 컬렉션에 저장한다 | 서버는 상태를 메모리에 두지 않는다 | [07 6장](07-feature-spec.md#6-데이터-구조-firestore) | 3번 |

### 1-4. 사용자 인증과 인가

| 체크리스트 | 구현한 곳 | 서버 확인과 테스트 | 명세 | README 확인 |
|---|---|---|---|---|
| 회원가입, 로그인, 로그아웃, 인증 상태 관리 | 가입 API: `apps/web/app/api/auth/signup`, `signup-google`. 로그인 화면: `apps/web/app/login`. 로그인 상태: `apps/web/src/entities/session/session.tsx` | 서버는 요청마다 로그인 토큰을 검증한다(`packages/core/src/application/auth.ts`의 `requireUser`) | [07 4-1](07-feature-spec.md#4-1-회원가입-로그인-로그아웃) | 4번의 1, 3, 4 |
| 비로그인도 목록과 시청은 되고, 등록과 송출은 로그인한 사람만 한다 | 목록과 시청 권한은 로그인을 묻지 않는다. 등록과 송출 권한 API는 `requireUser`를 먼저 부른다 | 로그인 없이 등록하면 401로 거절한다 | [07 5장](07-feature-spec.md#5-권한-표) | 4번의 2 |
| 수정, 삭제, 송출 제어 때 서버가 방송 주인을 확인한다 | `broadcast.ts`의 `loadOwned`: 방송 주인과 요청한 사람이 다르면 403. 수정, 삭제, 송출 권한, 송출 확인, 종료가 모두 이 함수를 거친다 | README의 curl 명령으로 남의 방송 수정·삭제·종료가 403인 것을 확인한다 | [07 5장](07-feature-spec.md#5-권한-표), [14 5장](14-architecture.md#5-인증과-인가) | 4번의 5, 6. [확인용 명령](../README.md#확인용-명령) |

## 2. 선택 요구사항

| 체크리스트 | 구현한 곳 | 서버 확인과 테스트 | 명세 | README 확인 |
|---|---|---|---|---|
| 댓글(채팅)을 작성, 조회, 수정, 삭제한다 | API: `apps/web/app/api/broadcasts/[id]/chat/route.ts`(작성), `chat/[messageId]/route.ts`(수정, 삭제). 로직: `packages/core/src/application/chat.ts`. 화면: `apps/web/src/features/chat/ChatPanel.tsx` | 작성은 로그인, 방송 상태, 제재, 금칙어, 1초 도배 제한을 확인한다 | [07 4-7](07-feature-spec.md#4-7-채팅), [06 결정 32](06-decisions.md#결정-32-채팅-수정과-삭제를-만든다) | 5번 |
| 수정과 삭제 때 서버가 작성자를 확인한다 | `packages/core/src/domain/chat.ts`의 `chatChangeBlock`: 작성자가 아니면 403. 후원·미션 메시지는 바꿀 수 없다 | 단위 테스트 `packages/core/src/domain/chat.test.ts`. README의 curl 명령으로 남의 채팅 수정·삭제가 403인 것을 확인한다 | [07 5장](07-feature-spec.md#5-권한-표) | 5번의 7~9 |
| 후원 대상과 금액을 고르고 테스트 결제를 요청한다 | 후원 창: `apps/web/src/features/donation/`. 충전 주문: `packages/core/src/application/honey.ts`의 `createCharge`. 토스페이먼츠 테스트 모드 | 본인인증(목업), 하루 충전 한도를 확인한다 | [07 4-8](07-feature-spec.md#4-8-후원) | 6번의 1~3 |
| 서버가 승인 결과, 금액, 대상을 확인하고 후원을 저장한다 | `honey.ts`의 `confirmByUser`: 주문의 주인과 금액을 확인한 뒤 토스페이먼츠 승인과 재조회로 결제 완료와 금액을 확인한다. 후원은 `packages/core/src/application/donation.ts`가 방송, 잔액, 자기 방송 여부를 확인하고 저장한다 | 토스페이먼츠 웹훅(`apps/web/app/api/webhooks/toss`)은 내용을 믿지 않고 결제를 다시 조회한다 | [07 4-8](07-feature-spec.md#4-8-후원), [07 7장](07-feature-spec.md#7-서버-알림-처리-웹훅) | 6번의 3 |
| 같은 승인 알림이 반복돼도 한 번만 적립하고, 방송별 내역과 합계를 보여 준다 | 이미 확정된 충전은 처음 결과를 그대로 돌려준다. 후원은 요청 번호로 한 번만 처리한다. 방송의 후원 합계와 건수는 같은 트랜잭션에서 늘어난다 | README의 curl 명령으로 같은 승인을 두 번 보내도 꿀이 한 번만 느는 것을 확인한다. 단위 테스트 `packages/core/src/domain/honey.test.ts` | [07 4-8](07-feature-spec.md#4-8-후원) | 6번의 4, 6, 12 |
| 라이브 방송을 녹화 영상으로 저장한다 | `packages/core/src/application/recording.ts`, `packages/core/src/adapters/egress.ts`: LiveKit egress로 MP4를 만들어 R2에 저장한다 | 3분 제한, 월 50분 한도. 단위 테스트 `packages/core/src/domain/recording.test.ts`, 점검 스크립트 `pnpm --filter @nabi/core check-recording` | [07 4-9](07-feature-spec.md#4-9-녹화와-다시보기) | 7번의 1, 2 |
| 녹화 목록, 상세, 재생 | API: `apps/web/app/api/recordings`. 화면: `apps/web/app/replays`, `apps/web/app/replays/[id]` | 공개 녹화이거나 본인 녹화일 때만 서명된 재생 주소를 준다 | [07 4-9](07-feature-spec.md#4-9-녹화와-다시보기) | 7번의 3, 5 |
| 영상 정보와 저장 위치를 영구 저장한다 | Firestore `recordings` 컬렉션에 파일 위치, 길이, 상태, 공개 여부를 저장한다 | 녹화가 끝나면 LiveKit 웹훅으로 상태를 채운다 | [07 6장](07-feature-spec.md#6-데이터-구조-firestore) | 7번의 2 |

## 3. 평가 기준별 근거

| 평가 기준 | 어디를 보면 되는가 |
|---|---|
| 기능 완결성 | 위 1장과 2장의 표. 실제 동작은 [README의 기능 확인 순서](../README.md#기능-확인-순서) |
| 인증과 인가 | [14 5장 인증과 인가](14-architecture.md#5-인증과-인가), [07 5장 권한 표](07-feature-spec.md#5-권한-표), [README의 확인용 명령](../README.md#확인용-명령) |
| 코드 품질과 안정성 | 구조: [14 2장 코드 구조](14-architecture.md#2-코드-구조). 예외 처리: 모든 API가 `apps/web/src/server/route.ts`를 거쳐 입력을 검사하고, 오류를 같은 모양(`{ error: { code, message } }`)으로 돌려준다. 방송 상태 관리: [14 3장](14-architecture.md#3-방송-상태). 돈 처리: Firestore 트랜잭션과 요청 번호로 한 번만 처리한다. 테스트: `pnpm -r test` |
| 문서화 | [루트 README](../README.md)(서비스 주소, 테스트 계정, 실행 방법, 환경변수, 기능 확인), [문서 색인](README.md) |
| 가산점(선택 기능) | 위 2장. 댓글, 후원, 녹화를 모두 만들었다 |

## 4. 기획, 디자인, 설계 문서

| 무엇을 | 문서 |
|---|---|
| 기획(문제, 대상, 가치, 범위) | [00 기획 통합 브리핑](00-planning-brief.md), 원문 [01](01-problem-definition.md)~[05](05-assumption-priorities.md) |
| 디자인(화면, 와이어프레임) | [08 화면 설계서](08-screen-spec.md), [피그마 목차](https://www.figma.com/design/gcj47GzbMmZlBQxZjoLHBp/%EB%82%98%EB%B9%84-%EC%8B%9C%EC%95%88?node-id=108-11417) |
| 설계(구성, 코드 구조, 흐름) | [14 설계](14-architecture.md), [06 결정 기록](06-decisions.md) |
| 기능 명세 | [13 기능 명세 요약](13-feature-overview.md), [07 기능 명세](07-feature-spec.md) |
| 수익 구조, 운영 정책 | [11 수익 구조](11-business-model.md), [12 운영 정책](12-policy.md) |
