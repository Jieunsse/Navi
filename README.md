# 나비

## 로컬에서 실행하기

### 필요한 도구

- Node 22.14 이상 (`.nvmrc` 참고)
- pnpm 10 (`corepack enable` 하면 `package.json`의 버전이 자동으로 쓰입니다)
- LiveKit 개발 서버: `brew install livekit`
- Java (Firebase 에뮬레이터의 Firestore가 씁니다)

### 처음 한 번

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # 이미 있으면 건너뜁니다. 값은 그대로 쓰면 됩니다.
```

### 서버 세 개 띄우기

터미널을 세 개 열고 루트에서 차례로 실행합니다.

```bash
pnpm livekit     # 1. LiveKit 개발 서버 (포트 7880)
pnpm emulators   # 2. Firebase 에뮬레이터: 로그인 9099, 데이터베이스 8080, 관리 화면 4000
pnpm dev         # 3. 웹 서버 (포트 3000) → http://localhost:3000
```

`pnpm livekit`은 방송 중 일어나는 일(송출 시작, 방송자 나감)을 `http://localhost:3000/api/webhooks/livekit`으로 알려 줍니다.
그래서 웹 서버(3)가 떠 있어야 방송이 "방송 중"과 "종료"로 바뀝니다.

### 녹화 환경 띄우기 (도커)

녹화(다시보기)는 LiveKit egress가 방을 합쳐서 MP4로 저장합니다. 로컬에서는 도커가 필요합니다.
`docker compose`로 redis, egress, S3 호환 저장소(s3mock, 포트 9090)를 띄웁니다. 저장소 주소와 키는 `apps/web/.env.local`의 `STORAGE_*` 변수입니다.

```bash
docker compose -f docker-compose.dev.yml up -d   # redis 6379, 저장소 9090, egress
pnpm livekit                                      # redis가 떠 있어야 켜집니다(livekit.dev.yaml이 redis를 씁니다)
```

- `pnpm livekit`은 이제 redis를 씁니다. 도커를 켜지 않고 방송만 확인하려면 `livekit.dev.yaml`의 `redis:` 두 줄을 잠시 주석 처리하세요. 이때는 녹화를 켜도 녹화가 실패로 남고 방송은 계속됩니다.
- egress를 처음 켠 뒤 첫 녹화는 크롬을 처음 띄우느라 실패할 수 있습니다. 실패하면 새 방송으로 다시 해 보세요.
- 도커 없이 녹화 규칙(상태 바뀜, 3분 제한, 월 50분, 웹훅 처리, 서명 주소)만 확인하려면 에뮬레이터를 켠 채로 `pnpm --filter @nabi/core check-recording`을 실행합니다. 가짜 egress와 가짜 저장소로 돌립니다.
- 배포는 Cloudflare R2를 씁니다. `STORAGE_ENDPOINT`(`https://<계정ID>.r2.cloudflarestorage.com`), `STORAGE_REGION=auto`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`를 채우고 `STORAGE_EGRESS_ENDPOINT`는 비웁니다.

### 테스트 계정 만들기 (시드)

에뮬레이터가 뜬 뒤에 한 번 실행합니다. 에뮬레이터를 껐다 켜면 데이터가 사라지니 다시 실행해 주세요.

```bash
pnpm seed
```

테스트방송자, 테스트시청자, 테스트운영자 계정 3개가 만들어집니다.

### 테스트 계정 버튼

`http://localhost:3000/login` 아래쪽의 "테스트 방송자 / 시청자 / 운영자로 로그인" 버튼을 누르면 비밀번호 없이 로그인됩니다.
`apps/web/.env.local`의 `ENABLE_TEST_LOGIN=true`일 때만 동작합니다.
테스트 방송자의 방송은 30분까지만 이어집니다.

### curl로 API 확인하기 (test-token)

```bash
pnpm test-token 시청자   # 방송자, 시청자, 운영자 중 하나
```

그 계정의 로그인 토큰을 한 줄로 출력합니다. 웹 서버가 떠 있어야 합니다.

```bash
TOKEN=$(pnpm -s test-token 방송자)
curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/me
```

### 문제 해결

- `pnpm emulators`에서 `EACCES` 오류가 나면, 이 환경이 `~/.config`를 읽지 못하는 경우입니다.
  설정 폴더를 읽을 수 있는 곳으로 바꿔서 띄웁니다.

  ```bash
  XDG_CONFIG_HOME=/tmp/xdg pnpm emulators
  ```

- 도커 데몬이 꺼져 있으면 `open -a Docker`로 켠 뒤 위 compose 명령을 다시 실행합니다.
- 방송이 "준비 중"에서 넘어가지 않으면 `pnpm livekit`과 `pnpm dev`가 모두 떠 있는지 확인합니다.
- 실제 화면 공유와 카메라는 브라우저가 허용을 물어봅니다. 자동 테스트로는 누를 수 없습니다.

### 확인 명령

```bash
pnpm -r typecheck
pnpm -r test
pnpm build
cd apps/web && pnpm exec eslint .
```
