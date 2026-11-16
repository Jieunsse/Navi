import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PENDING_CHARGE_MS, CANCEL_WINDOW_MS, payAmount } from "@nabi/shared/honey.ts";
import { FULL_RESET_INTERVAL_MS, SEED_KIND_LABEL, SEED_LOGINS, SEED_RENAMED, SEED_TARGET_LABEL, SEED_UIDS as U, type SeedAccount } from "@nabi/shared/seed.ts";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminAuth, db, FieldValue, iso, Timestamp } from "../adapters/firebase.ts";
import { createFakeEgress } from "../adapters/egress.ts";
import { createSeedLiveKit } from "../adapters/seedLivekit.ts";
import { createSeedToss } from "../adapters/seedToss.ts";
import { createSeedTransfer, SEED_FAILING_LAST4 } from "../adapters/seedTransfer.ts";
import { createStorage, type StoragePort } from "../adapters/storage.ts";
import { allocateFifo } from "../domain/honey.ts";
import { kstMonthStartOf } from "../domain/moderation.ts";
import { chunk, testRunMessage } from "../domain/settlement.ts";
import { AppError, conflict } from "../errors.ts";
import { createUserDocs } from "./account.ts";
import { adminUseCases } from "./admin.ts";
import { bannedWordsAdmin } from "./bannedWords.ts";
import { appealUseCases } from "./appeal.ts";
import type { UserDoc, Viewer } from "./auth.ts";
import { broadcastUseCases } from "./broadcast.ts";
import { chatUseCases } from "./chat.ts";
import { walletRef, bumpWallet } from "./donation.ts";
import { honeyUseCases } from "./honey.ts";
import { missionUseCases } from "./mission.ts";
import { moderationUseCases, syncReportTarget, syncSanctionSummary, writeAdminLog } from "./moderation.ts";
import { notificationUseCases } from "./notification.ts";
import { recordingUseCases } from "./recording.ts";
import { refundUseCases, type PayoutFn } from "./refund.ts";
import { settlementUseCases } from "./settlement.ts";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ALL: string[] = Object.values(U);
const SEEDED = new Set<string>(ALL);
const SEED_TEST_RUN = "seed-test-run-1"; // 월 정산 테스트 실행의 요청 번호(작업 기록 문서 ID)
const state = () => db().collection("config").doc("seedState");
const users = () => db().collection("users");

/** 계정 17개(4-18). 샘플 계정과 버튼 계정은 비밀번호를 무작위로 만들어 어디에도 적지 않는다. */
const ACCOUNTS: { uid: string; nickname: string; seedKind: string; login?: { email: string; password: string }; extra?: Record<string, unknown> }[] = [
  { uid: U.broadcaster, nickname: "테스트방송자", seedKind: "testBroadcaster" },
  { uid: U.viewer, nickname: "테스트시청자", seedKind: "testViewer" },
  { uid: U.admin, nickname: "테스트운영자", seedKind: "testAdmin", extra: { isAdmin: true, isTestAdmin: true } },
  { uid: U.practice, nickname: "연습용시청자", seedKind: "sanctionPractice", login: SEED_LOGINS.practice },
  { uid: U.suspended, nickname: "정지예시계정", seedKind: "suspendedExample", login: SEED_LOGINS.suspended },
  { uid: U.harin, nickname: "하린방송", seedKind: "sample" },
  { uid: U.minsu, nickname: "민수게임", seedKind: "sample" },
  { uid: U.jiwoo, nickname: "지우", seedKind: "sample" },
  { uid: U.seoyeon, nickname: "서연", seedKind: "sample" },
  { uid: U.haneul, nickname: "하늘달", seedKind: "sample" },
  { uid: U.doyun, nickname: "도윤", seedKind: "sample" },
  { uid: U.sora, nickname: "소라", seedKind: "sample" },
  { uid: U.boram, nickname: "보람", seedKind: "sample" },
  { uid: U.yerin, nickname: "예린", seedKind: "sample" },
  { uid: U.taeyang, nickname: "태양", seedKind: "sample" },
  { uid: U.jimin, nickname: "지민", seedKind: "sample" },
  { uid: U.seojun, nickname: "서준", seedKind: "sample" },
];
/** 샘플 계정 전체. 부분 초기화가 실제 운영자의 제재를 풀어 줄 대상이다. */
const SAMPLE_UIDS = ACCOUNTS.filter((a) => a.seedKind === "sample").map((a) => a.uid);

// 본인인증(목업) 값. 이름·생년월일·번호는 모두 지어낸 값이고, 명의가 서로 달라야 "같은 명의" 규칙에 걸리지 않는다.
const IDENTITIES: Record<string, { name: string; birth: string; phone: string }> = {
  [U.viewer]: { name: "테스트시청", birth: "1990-01-01", phone: "01000000001" },
  [U.broadcaster]: { name: "테스트방송", birth: "1991-01-01", phone: "01000000008" },
  [U.admin]: { name: "테스트운영", birth: "1989-01-01", phone: "01000000009" },
  [U.practice]: { name: "연습시청", birth: "1992-02-02", phone: "01000000002" },
  [U.jiwoo]: { name: "김지우", birth: "1995-05-05", phone: "01000000003" },
  [U.seoyeon]: { name: "박서연", birth: "1996-06-06", phone: "01000000004" },
  [U.sora]: { name: "이소라", birth: "1997-07-07", phone: "01000000005" },
  [U.taeyang]: { name: "최태양", birth: "1994-04-04", phone: "01000000006" },
  [U.jimin]: { name: "정지민", birth: "1993-03-03", phone: "01000000007" },
};
const PAYOUTS: Record<string, { last4: string; holder: string }> = {
  [U.broadcaster]: { last4: "1234", holder: "테스트방송" },
  [U.viewer]: { last4: "1357", holder: "테스트시청" },
  [U.admin]: { last4: "2580", holder: "테스트운영" },
  [U.practice]: { last4: "5678", holder: "연습시청" },
  [U.harin]: { last4: "9012", holder: "하린" },
  [U.haneul]: { last4: "3456", holder: "하늘" },
  [U.boram]: { last4: "7890", holder: "보람" },
  [U.seojun]: { last4: "2468", holder: "서준" },
  [U.yerin]: { last4: SEED_FAILING_LAST4, holder: "예린" }, // 이 계좌로는 송금이 실패한다("지급 실패"를 실제 지급 함수로 만들기 위해)
}; // 민수게임과 도윤은 계좌가 없다(정산 보류 "정산 정보 없음"을 보여주기 위해)

/** 제재 연습용 계정에 걸린 신고 4건(채팅 3, 사용자 1). 문서 ID가 신고자_종류_대상이라 초기화는 이 문서를 되살린다. */
const PRACTICE_CHATS = ["seed-bc-test-a-c7", "seed-bc-test-a-c11", "seed-bc-test-a-c14"];
const PRACTICE_REPORTS = [
  { reporter: U.jiwoo, targetType: "chat", targetId: PRACTICE_CHATS[0]!, reason: "spam", detail: "광고처럼 보여요" },
  { reporter: U.jiwoo, targetType: "chat", targetId: PRACTICE_CHATS[1]!, reason: "abuse", detail: "" },
  { reporter: U.seoyeon, targetType: "chat", targetId: PRACTICE_CHATS[2]!, reason: "spam", detail: "상품권 링크를 올렸어요" },
  { reporter: U.jiwoo, targetType: "user", targetId: U.practice, reason: "abuse", detail: "다른 방송에서도 같은 행동을 했어요" },
] as const;

/** 시드 실행자: 테스트 운영자 계정으로 운영 기능을 부르되 테스트 계정 보호를 건너뛴다(06 결정 28). */
export const seedRunner = (): Viewer => ({
  uid: U.admin,
  user: { nickname: "테스트운영자", email: `${U.admin}@nabi.test`, grade: "egg", isAdmin: true, isTestAdmin: false, seedKind: "testAdmin" },
});

const STALE_LOCK_MS = 10 * 60_000;
const isLocked = (s: { resetting?: boolean; resettingAt?: { toMillis(): number } } | undefined) => !!s?.resetting && Date.now() - (s.resettingAt?.toMillis() ?? 0) < STALE_LOCK_MS;

/** ffmpeg로 30초짜리 테스트 화면 영상(색 막대와 사인파 소리)을 만든다. 없으면 null. 저작권 문제가 없는 영상만 쓴다(4-18). */
function makeVideo(source: string, hz: number): Uint8Array | null {
  const dir = mkdtempSync(join(tmpdir(), "nabi-seed-"));
  try {
    const out = join(dir, "v.mp4");
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `${source}=size=640x360:rate=24:duration=30`, "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=30`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-c:a", "aac", "-shortest", "-movflags", "+faststart", out],
      { stdio: "ignore" },
    );
    return readFileSync(out);
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export type SeedDeps = {
  /** 방송 종료 함수. 전체 초기화가 시드 방송자의 방송 중인 방송을 끝낼 때 쓴다(07 3장). */
  end: (broadcastId: string) => Promise<boolean>;
  storage?: StoragePort;
  log?: (msg: string) => void;
};

export function seedUseCases(deps: SeedDeps) {
  const log = deps.log ?? (() => undefined);
  const storage = deps.storage ?? createStorage();
  // 바깥 서비스만 시드용으로 바꾼다: 결제는 시드 결제, LiveKit은 건너뜀, 녹화는 가짜 egress. 나머지는 실제 유스케이스다.
  const lk = createSeedLiveKit();
  const honey = honeyUseCases(createSeedToss(), lk);
  const missions = missionUseCases(lk);
  const mod = moderationUseCases();
  const refunds = refundUseCases();
  const bc = broadcastUseCases(lk, recordingUseCases(createFakeEgress(), storage));
  const chat = chatUseCases(lk, bc.enforceTestLimit);
  const admin = adminUseCases(lk, bc.end);
  const settlements = settlementUseCases(createSeedTransfer());
  // 송금 실패 예시용: 환급 승인을 하면 은행이 실패를 돌려준다.
  const failingPayout: PayoutFn = async () => {
    throw new Error("은행 점검 중이라 송금하지 못했어요(예시)");
  };
  const failingRefunds = refundUseCases(failingPayout);

  const viewerOf = async (uid: string): Promise<Viewer> => ({ uid, user: (await users().doc(uid).get()).data() as UserDoc });
  const ts = (ms: number) => Timestamp.fromMillis(ms);

  // ---- 조회 도우미
  async function byUsers(col: string, field: string) {
    const out: QueryDocumentSnapshot[] = [];
    for (const part of chunk(ALL, 30)) out.push(...(await db().collection(col).where(field, "in", part).get()).docs);
    return out;
  }
  async function removeDocs(docs: { ref: FirebaseFirestore.DocumentReference }[]) {
    for (const part of chunk(docs, 400)) {
      const b = db().batch();
      part.forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }

  // ---- 지우기(전체 초기화, 4-18)
  /** 처리 중인 돈이 있으면 이유를 돌려준다. 진행 중인 돈 처리를 끊으면 4-8의 불변식이 깨지기 때문이다. */
  async function blockers() {
    const out: string[] = [];
    // 시드가 일부러 만든 처리 중 기록(seedData: true)은 막지 않는다. 전체 초기화가 지운다. 심사자가 만든 기록만 막는다.
    const mine = (d: QueryDocumentSnapshot) => !d.data().seedData;
    const [donA, donB, charges, refunds, settlements] = await Promise.all([
      byUsers("donations", "donorId"),
      byUsers("donations", "streamerId"),
      byUsers("charges", "userId"),
      byUsers("refunds", "userId"),
      byUsers("settlements", "streamerId"),
    ]);
    if ([...donA, ...donB].some((d) => mine(d) && d.data().kind === "mission" && ["pending", "active"].includes(d.data().missionStatus))) out.push("대기 중이거나 진행 중인 미션이 있어요");
    // 만든 지 30분이 넘은 결제 대기는 하루 한도에도 세지 않는 멈춘 주문이라 막지 않는다.
    const stale = Date.now() - PENDING_CHARGE_MS;
    if (charges.some((d) => mine(d) && (d.data().status === "canceling" || (d.data().status === "pending" && d.data().createdAt.toMillis() > stale)))) out.push("결제 대기나 취소 중인 충전이 있어요");
    if (refunds.some((d) => mine(d) && ["pending", "sending", "failed"].includes(d.data().status))) out.push("처리 중인 환급 신청(대기, 송금 중, 송금 실패)이 있어요");
    if (settlements.some((d) => mine(d) && d.data().status === "sending")) out.push("송금 중인 정산 기록이 있어요");
    return out;
  }

  /** 시드 계정이 주인인 문서를 지운다. 실제 사용자가 얽힌 후원은 남기고 시드 쪽 이름만 바꾼다. 운영 기록과 Firebase 계정은 건드리지 않는다. */
  async function wipe() {
    const fs = db();
    const owned = await byUsers("broadcasts", "ownerId");
    await Promise.all(chunk(owned.map((d) => d.id), 30).map(async (part) => removeDocs((await fs.collection("hiddenComments").where("broadcastId", "in", part).get()).docs)));
    await removeDocs(await byUsers("recordings", "ownerId"));
    await Promise.all(owned.map((d) => fs.recursiveDelete(d.ref))); // 채팅 등 하위 문서까지

    const donations = new Map<string, QueryDocumentSnapshot>();
    for (const f of ["donorId", "streamerId"]) for (const d of await byUsers("donations", f)) donations.set(d.id, d);
    const gone: QueryDocumentSnapshot[] = [];
    const kept: Promise<unknown>[] = [];
    for (const d of donations.values()) {
      const x = d.data();
      const donor = SEEDED.has(x.donorId);
      const streamer = SEEDED.has(x.streamerId);
      if (donor && streamer) gone.push(d);
      else kept.push(d.ref.update({ ...(donor && { donorNickname: SEED_RENAMED }), ...(streamer && { streamerNickname: SEED_RENAMED, settlementId: null }) }));
    }
    await Promise.all([...kept, removeDocs(gone)]);

    const byOwner = [["charges", "userId"], ["honeyLedger", "userId"], ["refunds", "userId"], ["reports", "reporterId"], ["sanctions", "userId"], ["appeals", "userId"], ["settlements", "streamerId"], ["nicknames", "uid"]] as const;
    // 시드 계정이 한 신고가 사라지면 신고 대상 요약이 틀어지므로, 지운 뒤 대상들의 요약을 다시 만든다.
    const reported = new Set((await byUsers("reports", "reporterId")).map((d) => d.data().targetUserId as string));
    await Promise.all([
      ...byOwner.map(async ([col, field]) => removeDocs(await byUsers(col, field))),
      ...["wallets", "identityVerifications", "payoutAccounts"].map((col) => removeDocs(ALL.map((uid) => ({ ref: fs.collection(col).doc(uid) })))),
      // 시드가 만든 작업 실행 기록. 테스트 실행은 고정 문서 ID라 표시가 빠졌어도 함께 지운다.
      (async () => removeDocs([...(await fs.collection("jobRuns").where("seedData", "==", true).get()).docs, { ref: fs.collection("jobRuns").doc(SEED_TEST_RUN) }]))(),
    ]);
    await Promise.all(ALL.map((uid) => fs.recursiveDelete(users().doc(uid)))); // 알림, 등급 변경 내역, 활동 제한 포함
    for (const uid of new Set([...reported, ...ALL])) await syncReportTarget(uid);
  }

  // ---- 만들기(4-18)
  async function ensureAccounts() {
    await Promise.all(
      ACCOUNTS.map(async (a) => {
        const email = a.login?.email ?? `${a.uid}@nabi.test`;
        const password = a.login?.password ?? crypto.randomUUID();
        const exists = await adminAuth().getUser(a.uid).then(() => true, () => false);
        if (exists) await adminAuth().updateUser(a.uid, { email, password, disabled: false });
        else await adminAuth().createUser({ uid: a.uid, email, password, emailVerified: true });
        await createUserDocs(a.uid, a.nickname, email, { seedKind: a.seedKind, seedData: true, ...a.extra });
      }),
    );
  }

  /** 충전: 실제 충전 주문과 승인을 시드 결제로 거친다. */
  async function charge(uid: string, amount: number) {
    const v = await viewerOf(uid);
    const { orderId, amount: won } = await honey.createCharge(v, { honey: amount });
    await honey.confirmByUser(v, { paymentKey: `seed_pay_${orderId}`, orderId, amount: won });
    return orderId;
  }

  /** 충전 시각을 과거로 돌린다(충전 취소 기한 7일이 지난 충전을 만든다). */
  async function backdateCharge(orderId: string, ageMs: number) {
    const at = ts(Date.now() - ageMs);
    await db().collection("charges").doc(orderId).update({ createdAt: at, approvedAt: at, cancelableUntil: ts(at.toMillis() + CANCEL_WINDOW_MS) });
    for (const l of (await db().collection("honeyLedger").where("chargeId", "==", orderId).get()).docs) if (l.data().type === "charge") await l.ref.update({ createdAt: at });
  }

  type Scene = {
    say(uid: string, text: string): Promise<string>;
    donate(uid: string, amount: number, message: string): Promise<string>;
    mission(uid: string, amount: number, content: string, limitMinutes: number): Promise<string>;
    act(missionId: string, action: "accept" | "success" | "fail"): Promise<void>;
  };
  type SceneSpec = { id: string; owner: string; title: string; category: string; hoursAgo: number; recording?: { video: number; isPublic: boolean; shared?: boolean } };
  const videos: (Uint8Array | null)[] = [];
  const sharedKey = (i: number) => `recordings/seed/seed-shared-${i}.mp4`;

  /**
   * 지난 방송 하나. 송출 없이 "방송 중"으로 만든 뒤 채팅·후원·미션은 실제 유스케이스로 넣고,
   * 마지막에 종료 상태와 과거 시각으로 바꾼다. 방송 횟수와 누적 시간은 시드 실행자가 직접 더한다(06 결정 28).
   */
  async function scene(spec: SceneSpec, addStats: boolean, act: (s: Scene) => Promise<void>) {
    const bref = db().collection("broadcasts").doc(spec.id);
    const owner = await viewerOf(spec.owner);
    const now = Timestamp.now();
    // 방송 중 상태로 만든다. 시작 시각은 지금이라야 테스트 방송자의 30분 제한에 걸리지 않는다.
    await bref.set({
      ownerId: owner.uid,
      ownerNickname: owner.user.nickname,
      title: spec.title,
      category: spec.category,
      viewerCount: 0, // 종료·준비 방송은 0명
      sourceType: "screen",
      withCamera: false,
      status: "live",
      recordingEnabled: false,
      roomName: spec.id,
      donationTotal: 0,
      donationCount: 0,
      createdAt: now,
      startedAt: now,
      endedAt: null,
      seedData: true,
    });
    let n = 0;
    await act({
      async say(uid, text) {
        const messageId = `${spec.id}-c${++n}`;
        await chat.send(await viewerOf(uid), spec.id, { messageId, content: text });
        await bref.collection("chatters").doc(uid).delete(); // 도배 1초 제한 기록은 남기지 않는다
        return messageId;
      },
      async donate(uid, amount, message) {
        const requestId = `${spec.id}-d${++n}-${amount}`;
        await honey.donate(await viewerOf(uid), spec.id, { requestId, amount, message, anonymous: false });
        return requestId;
      },
      async mission(uid, amount, content, limitMinutes) {
        const requestId = `${spec.id}-m${++n}-${amount}`;
        await honey.donateMission(await viewerOf(uid), spec.id, { requestId, amount, content, limitMinutes, anonymous: false });
        return requestId;
      },
      async act(missionId, action) {
        await missions.act(owner, spec.id, missionId, action);
      },
    });

    // 과거로 옮긴다: 방송 시간 안에 채팅과 후원을 고르게 놓는다.
    const durationMs = HOUR;
    const startMs = Date.now() - spec.hoursAgo * HOUR;
    const comments = (await bref.collection("comments").get()).docs.sort((a, b) => a.data().createdAt.toMillis() - b.data().createdAt.toMillis() || a.id.localeCompare(b.id));
    for (const [i, c] of comments.entries()) {
      const at = ts(startMs + Math.floor((durationMs * (i + 1)) / (comments.length + 1)));
      await c.ref.update({ createdAt: at });
      const don = await db().collection("donations").doc(c.id).get();
      if (don.exists) await don.ref.update({ createdAt: at, ...(don.data()!.confirmedAt && { confirmedAt: at }), ...(don.data()!.acceptedAt && { acceptedAt: at }) });
    }
    let recordingId: string | null = null;
    if (spec.recording) {
      recordingId = `seed-rec-${spec.id.replace("seed-bc-", "")}`;
      // shared면 샘플 방송자끼리 영상 파일 하나를 함께 쓴다(미리 한 번 올려 둔다). 샘플 계정은 로그인할 수 없어 지워질 일이 없다.
      const storageKey = spec.recording.shared ? sharedKey(spec.recording.video) : `recordings/seed/${recordingId}.mp4`;
      const video = videos[spec.recording.video];
      if (video && !spec.recording.shared) await storage.put(storageKey, video, "video/mp4").catch((e) => log(`영상 올리기 실패(${recordingId}): ${e instanceof Error ? e.message : e}`));
      await db().collection("recordings").doc(recordingId).set({
        broadcastId: spec.id,
        ownerId: owner.uid,
        ownerNickname: owner.user.nickname,
        broadcastTitle: spec.title,
        egressId: null,
        status: "ready",
        isPublic: spec.recording.isPublic,
        storageKey,
        durationMs: 30_000,
        startedAt: ts(startMs),
        endedAt: ts(startMs + durationMs),
        stopRequested: false,
        seedData: true,
      });
    }
    await bref.update({ status: "ended", createdAt: ts(startMs - 5 * 60_000), startedAt: ts(startMs), endedAt: ts(startMs + durationMs), recordingEnabled: !!recordingId, recordingId });
    if (addStats) await users().doc(spec.owner).update({ broadcastCount: FieldValue.increment(1), totalBroadcastMs: FieldValue.increment(durationMs) });
  }

  /**
   * 지금 방송 중인 예시 방송 하나. 송출은 없고(시드 LiveKit이 건너뜀) 문서와 채팅만 있다.
   * 채팅은 실제 채팅 유스케이스로 넣은 뒤 시작 시각과 지금 사이에 고르게 옮긴다.
   */
  async function liveScene(spec: { id: string; owner: string; title: string; category: string; viewerCount: number; sourceType: "screen" | "camera"; minutesAgo: number }, lines: [string, string][], donations: { uid: string; amount: number; message: string }[] = []) {
    const bref = db().collection("broadcasts").doc(spec.id);
    const owner = await viewerOf(spec.owner);
    const now = Timestamp.now();
    const startMs = now.toMillis() - spec.minutesAgo * 60_000;
    await bref.set({
      ownerId: owner.uid,
      ownerNickname: owner.user.nickname,
      title: spec.title,
      category: spec.category,
      viewerCount: spec.viewerCount, // 예시 방송이라 시청자 수는 지어낸 값이다(웹훅이 없어서 직접 쓴다)
      sourceType: spec.sourceType,
      withCamera: false,
      status: "live",
      recordingEnabled: false,
      roomName: spec.id,
      donationTotal: 0,
      donationCount: 0,
      createdAt: ts(startMs - 2 * 60_000),
      startedAt: ts(startMs),
      endedAt: null,
      seedData: true,
    });
    for (const [i, [uid, text]] of lines.entries()) {
      await chat.send(await viewerOf(uid), spec.id, { messageId: `${spec.id}-c${i + 1}`, content: text });
      await bref.collection("chatters").doc(uid).delete(); // 도배 1초 제한 기록은 남기지 않는다
      await bref.collection("comments").doc(`${spec.id}-c${i + 1}`).update({ createdAt: ts(startMs + Math.floor(((now.toMillis() - startMs) * (i + 1)) / (lines.length + 1))) });
    }
    for (const [i, d] of donations.entries()) await honey.donate(await viewerOf(d.uid), spec.id, { requestId: `${spec.id}-d${i + 1}-${d.amount}`, amount: d.amount, message: d.message, anonymous: false });
  }

  /** 준비 중인 예시 방송. 만든 지 몇 분 안 된 채로 시작하지 않은 방송이라 홈에 1시간 동안 보인다. */
  async function readyScene(spec: { id: string; owner: string; title: string; category: string; minutesAgo: number }) {
    const owner = await viewerOf(spec.owner);
    await db().collection("broadcasts").doc(spec.id).set({
      ownerId: owner.uid, ownerNickname: owner.user.nickname, title: spec.title, category: spec.category, viewerCount: 0, sourceType: "camera", withCamera: false,
      status: "ready", recordingEnabled: false, roomName: spec.id, donationTotal: 0, donationCount: 0, createdAt: ts(Date.now() - spec.minutesAgo * 60_000), startedAt: null, endedAt: null, seedData: true,
    });
  }

  /** 등급, 방송 횟수, 누적 시간, 받은 후원 건수를 직접 쓴다. 샘플 방송자와 부분 초기화만 쓴다(06 결정 28). */
  async function writeGrade(uid: string, grade: string, shareRate: number, stats: { broadcastCount: number; totalBroadcastMs: number; donationReceivedCount: number }, note?: string) {
    await users().doc(uid).update({ grade, ...stats });
    await users().doc(uid).collection("gradeHistory").add({ grade, shareRate, changedAt: Timestamp.now(), seedData: true, ...(note && { note }) });
  }

  async function createPracticeReport(r: (typeof PRACTICE_REPORTS)[number]) {
    await mod.report(await viewerOf(r.reporter), { targetType: r.targetType, targetId: r.targetId, broadcastId: r.targetType === "chat" ? "seed-bc-test-a" : undefined, reason: r.reason, detail: r.detail });
  }

  /** 시드가 만든 문서에 "시드 데이터" 표시를 붙인다. 유스케이스가 만든 문서에는 이 표시가 없어서 마지막에 한 번에 붙인다. */
  async function tagSeedDocs() {
    const targets: [string, string][] = [["charges", "userId"], ["honeyLedger", "userId"], ["donations", "donorId"], ["donations", "streamerId"], ["reports", "reporterId"], ["sanctions", "userId"], ["appeals", "userId"], ["refunds", "userId"], ["settlements", "streamerId"]];
    const refs = new Map<string, FirebaseFirestore.DocumentReference>();
    for (const docs of await Promise.all(targets.map(([col, f]) => byUsers(col, f)))) for (const d of docs) refs.set(d.ref.path, d.ref);
    const byId = ["wallets", "identityVerifications"].flatMap((col) => ALL.map((uid) => db().collection(col).doc(uid)));
    for (const s of await db().getAll(...byId)) if (s.exists) refs.set(s.ref.path, s.ref); // 없는 문서는 만들지 않는다
    await Promise.all(
      chunk([...refs.values()], 400).map((part) => {
        const b = db().batch();
        part.forEach((r) => b.update(r, { seedData: true }));
        return b.commit();
      }),
    );
  }

  /** 처리 중인 돈 기록은 만들자마자 표시를 붙인다. 중간에 멈춰도 다음 초기화가 막히지 않게 하기 위해서다. */
  const tagNow = (ref: FirebaseFirestore.DocumentReference) => ref.update({ seedData: true });

  async function build() {
    const par = <T,>(items: readonly T[], fn: (x: T) => Promise<unknown>) => Promise.all(items.map(fn));
    const runner = seedRunner();
    await ensureAccounts();
    log(`계정 ${ACCOUNTS.length}개 준비`);
    await Promise.all([
      par(Object.entries(IDENTITIES), async ([uid, i]) => honey.verifyIdentity(await viewerOf(uid), i)),
      (async () => {
        const payoutAt = Timestamp.now();
        await par(Object.entries(PAYOUTS), ([uid, p]) => db().collection("payoutAccounts").doc(uid).set({ bank: "테스트은행", last4: p.last4, holder: p.holder, test: true, registeredAt: payoutAt, seedData: true }));
      })(),
      // 샘플 방송자의 등급과 통계는 직접 쓴다. 후원을 받기 전에 써야 그 후원에 등급 비율이 맞게 붙는다.
      writeGrade(U.harin, "pupa", 0.85, { broadcastCount: 16, totalBroadcastMs: 22 * HOUR, donationReceivedCount: 34 }),
      writeGrade(U.minsu, "larva", 0.82, { broadcastCount: 4, totalBroadcastMs: 3 * HOUR, donationReceivedCount: 0 }),
      writeGrade(U.haneul, "butterfly", 0.88, { broadcastCount: 64, totalBroadcastMs: 130 * HOUR, donationReceivedCount: 350 }),
      writeGrade(U.boram, "pupa", 0.85, { broadcastCount: 18, totalBroadcastMs: 25 * HOUR, donationReceivedCount: 40 }),
      writeGrade(U.yerin, "larva", 0.82, { broadcastCount: 5, totalBroadcastMs: 4 * HOUR, donationReceivedCount: 3 }),
      writeGrade(U.seojun, "larva", 0.82, { broadcastCount: 6, totalBroadcastMs: 7 * HOUR, donationReceivedCount: 5 }),
      users().doc(U.doyun).update({ broadcastCount: 1, totalBroadcastMs: HOUR, donationReceivedCount: 0 }), // 알 등급 그대로
    ]);

    // 충전. 태양은 취소한 충전 1건을 더 만든다(쓰기 전에 취소해야 하므로 후원 전에 한다).
    let practiceCharge = "";
    await Promise.all([
      par([U.viewer, U.jiwoo, U.seoyeon, U.broadcaster, U.admin], (uid) => charge(uid, 10_000)),
      charge(U.practice, 10_000).then((id) => (practiceCharge = id)),
      charge(U.sora, 10_000),
      charge(U.jimin, 10_000),
      (async () => {
        await charge(U.taeyang, 8_000);
        const v = await viewerOf(U.taeyang);
        const { orderId, amount } = await honey.createCharge(v, { honey: 3_000 });
        await honey.confirmByUser(v, { paymentKey: `seed_pay_${orderId}`, orderId, amount });
        await honey.cancelCharge(v, orderId);
      })(),
    ]);
    log("충전 완료");

    // 다시보기 영상 파일은 샘플 방송자끼리 나눠 쓴다. 한 번만 올린다.
    await Promise.all(
      videos.map(async (v, i) => {
        if (v) await storage.put(sharedKey(i), v, "video/mp4").catch((e) => log(`영상 올리기 실패(${i}): ${e instanceof Error ? e.message : e}`));
      }),
    );

    // 채팅·후원 중에 나중에 신고할 채팅의 ID를 적어 둔다.
    const ids: Record<string, string> = {};
    const V = U.viewer;
    const laneA = async () => {
    await scene({ id: "seed-bc-test-a", category: "게임", owner: U.broadcaster, title: "예시 방송 · 첫 게임 데이", hoursAgo: 50, recording: { video: 0, isPublic: true } }, true, async (s) => {
      await s.say(U.broadcaster, "안녕하세요! 오늘 첫 방송이에요"); // c1
      await s.say(V, "안녕하세요~ 소리 잘 들려요"); // c2
      await s.say(U.jiwoo, "화면 선명해요"); // c3
      await s.say(U.seoyeon, "오늘 뭐 하세요?"); // c4
      await s.say(U.broadcaster, "오늘은 새 게임 해 볼게요"); // c5
      await s.donate(V, 7000, "첫 방송 축하해요! 계속 응원할게요"); // d6
      await s.say(U.practice, "이거 광고 아닌가요 ㅋㅋ"); // c7 (신고됨)
      await s.say(U.jiwoo, "ㅅㅂ 방금 그거 뭐야"); // c8 (금칙어로 숨김)
      await s.donate(U.seoyeon, 2000, "맛있는 거 사 드세요"); // d9
      await s.say(V, "방금 장면 대박"); // c10
      await s.say(U.practice, "재미없어요 그만하세요"); // c11 (신고됨)
      await s.donate(U.jiwoo, 1000, "화이팅!"); // d12
      await s.say(U.seoyeon, "나도 해보고 싶다"); // c13
      await s.say(U.practice, "여기 공짜 상품권 링크 보세요"); // c14 (신고됨)
      await s.say(U.broadcaster, "다들 와줘서 고마워요"); // c15
      await s.say(V, "다음 방송도 올게요"); // c16
    });

    await scene({ id: "seed-bc-test-b", category: "그림", owner: U.broadcaster, title: "예시 방송 · 그림 그리기", hoursAgo: 30, recording: { video: 0, isPublic: false } }, true, async (s) => {
      await s.say(U.broadcaster, "그림 그리기 시작합니다");
      await s.say(V, "오 색감 예뻐요");
      await s.say(U.jiwoo, "저도 그림 배우고 싶어요");
      await s.say(U.seoyeon, "음악 뭐예요?");
      await s.say(U.broadcaster, "잔잔한 노래 틀었어요");
      await s.donate(U.jiwoo, 3000, "커피 한 잔 하세요");
      const ok = await s.mission(V, 3000, "고양이 한 마리 그려 주기", 30);
      await s.act(ok, "accept");
      await s.say(U.broadcaster, "좋아요, 고양이 그려 볼게요");
      await s.act(ok, "success"); // 미션 성공: 상금 3,000꿀
      const late = await s.mission(U.jiwoo, 5000, "눈 감고 그림 그리기", 10);
      await s.act(late, "accept");
      await s.act(late, "fail"); // 미션 실패: 응원금 1,000꿀만 전달, 나머지는 돌려받는다
      await s.say(V, "미션 성공 축하해요!");
      await s.say(U.seoyeon, "대박이다");
      await s.say(U.broadcaster, "다음에는 더 어려운 것도 해 볼게요");
    });

    await scene({ id: "seed-bc-practice", category: "잡담", owner: U.practice, title: "예시 방송 · 연습용 시청자의 방송", hoursAgo: 20 }, true, async (s) => {
      await s.say(U.practice, "처음 방송해 봅니다");
      await s.say(U.seoyeon, "안녕하세요!");
      await s.donate(U.seoyeon, 1000, "재밌어요!");
      await s.say(U.jiwoo, "응원하러 왔어요");
      await s.donate(U.seoyeon, 2000, "응원해요");
    });

    await scene({ id: "seed-bc-harin", category: "요리", owner: U.harin, title: "예시 방송 · 하린의 요리 시간", hoursAgo: 60, recording: { video: 1, isPublic: true } }, false, async (s) => {
      await s.say(U.harin, "오늘은 파스타를 만들어요");
      await s.say(U.seoyeon, "맛있겠다");
      await s.say(U.jiwoo, "이 방송 별로네요 보지 마세요"); // c3 (테스트 시청자가 신고, 기각됨)
      await s.say(V, "재료가 뭐예요?");
      await s.donate(U.practice, 3000, "맛있겠다");
      await s.say(U.harin, "토마토랑 마늘이에요");
      await s.donate(U.practice, 2000, "다음에도 올게요");
    });

    await scene({ id: "seed-bc-minsu", category: "게임", owner: U.minsu, title: "예시 방송 · 민수의 게임 방송", hoursAgo: 40, recording: { video: 2, isPublic: true } }, false, async (s) => {
      await s.say(U.minsu, "랭크 게임 시작합니다");
      await s.say(U.jiwoo, "화이팅");
      await s.donate(U.jiwoo, 1000, "화이팅");
      await s.say(U.seoyeon, "이번 판 이길 수 있어요");
      await s.donate(U.jiwoo, 2000, "잘 보고 가요");
    });

    // 테스트 시청자와 테스트 운영자도 지난 방송 1개씩을 둔다. 내 방송 관리, 다시보기, 정산 내역이 비지 않게 하기 위해서다.
    // 62시간보다 오래된 방송이라 아래 정산 테스트 실행에 들어가 "지급 완료(테스트)"가 된다. 방송 1회라 둘 다 알 등급 그대로다.
    await scene({ id: "seed-bc-viewer-1", category: "잡담", owner: V, title: "예시 방송 · 테스트시청자의 첫 방송", hoursAgo: 70, recording: { video: 0, isPublic: true, shared: true } }, true, async (s) => {
      await s.say(V, "시청만 하다가 처음 방송을 켜 봤어요");
      await s.say(U.seoyeon, "첫 방송 축하해요");
      await s.donate(U.seoyeon, 2000, "첫 방송 축하해요");
      await s.say(U.jiwoo, "목소리 잘 들려요");
      await s.say(V, "와 주셔서 고마워요");
      await s.donate(U.seoyeon, 1000, "다음 방송도 올게요");
    });
    await scene({ id: "seed-bc-admin-1", category: "잡담", owner: U.admin, title: "예시 방송 · 운영자와 함께하는 이용 안내", hoursAgo: 72, recording: { video: 2, isPublic: true, shared: true } }, true, async (s) => {
      await s.say(U.admin, "나비 이용 방법을 안내해 드려요");
      await s.say(U.broadcaster, "후원은 어떻게 하나요?");
      await s.say(U.admin, "방송 화면의 후원하기 버튼을 누르면 돼요");
      await s.donate(U.broadcaster, 3000, "안내 고마워요");
      const m = await s.mission(U.broadcaster, 2000, "신고하는 방법도 보여 주세요", 30);
      await s.act(m, "accept");
      await s.say(U.admin, "채팅에서 닉네임을 누르면 신고할 수 있어요");
      await s.act(m, "success");
      await s.say(U.seoyeon, "정리가 잘 돼 있어요");
      await s.donate(U.seoyeon, 1000, "유익했어요");
    });
    };

    // 정산 테스트 실행에 들어갈 지난 방송은 모두 62시간 전보다 오래된 것이다(아래 정산 단계 참고). 방송자 몫은 지난 방송 안에서만 나온다.
    const SR = { video: 0, isPublic: true, shared: true };
    const laneB = async () => {
      await scene({ id: "seed-bc-haneul-1", category: "잡담", owner: U.haneul, title: "예시 방송 · 하늘달의 별 보는 밤", hoursAgo: 66, recording: { ...SR, video: 1 } }, false, async (s) => {
        await s.say(U.haneul, "별 보러 오신 분들 환영해요");
        await s.say(U.sora, "안녕하세요 처음 왔어요");
        await s.say(U.taeyang, "오늘은 어떤 별자리예요?");
        await s.say(U.jiwoo, "사진 찍어 둔 것도 보여 주세요");
        await s.donate(U.sora, 3000, "별 구경 고마워요");
        await s.say(U.haneul, "오늘은 여름 별자리를 볼게요");
        ids.soraA = await s.say(U.sora, "이 방송 진짜 재미없네 시간 낭비다");
        ids.soraB = await s.say(U.sora, "별 보는 게 뭐가 재밌냐 바보들이네");
        await s.donate(U.taeyang, 2000, "따뜻한 차 한 잔 하세요");
        const m = await s.mission(U.taeyang, 2000, "별 하나에 이름 붙여 주기", 30);
        await s.act(m, "accept");
        await s.say(U.haneul, "그럼 저 밝은 별을 나비별이라 부를게요");
        await s.act(m, "success");
        await s.say(U.seoyeon, "이름 예뻐요");
      });
      await scene({ id: "seed-bc-haneul-2", category: "여행", owner: U.haneul, title: "예시 방송 · 하늘달의 캠핑 이야기", hoursAgo: 63, recording: { ...SR, video: 2 } }, false, async (s) => {
        await s.say(U.haneul, "지난 주말 캠핑 다녀온 이야기를 해요");
        await s.say(U.taeyang, "불멍 사진 있어요?");
        await s.say(U.sora, "저도 캠핑 가고 싶어요");
        await s.donate(U.sora, 2000, "맛있는 거 드세요");
        await s.say(U.haneul, "사진 올릴게요");
        await s.donate(U.taeyang, 1000, "화이팅");
        await s.say(U.jiwoo, "부럽다");
      });
      await scene({ id: "seed-bc-seojun-1", category: "공부", owner: U.seojun, title: "예시 방송 · 서준의 코딩 공부", hoursAgo: 67, recording: SR }, false, async (s) => {
        await s.say(U.seojun, "오늘은 배열 공부해요");
        await s.say(U.sora, "저도 같이 배워요");
        await s.donate(U.sora, 1000, "응원해요");
        await s.say(U.seoyeon, "질문해도 돼요?");
        await s.say(U.seojun, "네 편하게 물어보세요");
      });
    };
    const laneC = async () => {
      await scene({ id: "seed-bc-doyun-1", category: "요리", owner: U.doyun, title: "예시 방송 · 도윤의 야식 먹방", hoursAgo: 68 }, false, async (s) => {
        await s.say(U.doyun, "야식 먹방 시작합니다");
        await s.say(U.jimin, "맛있겠다");
        await s.donate(U.jimin, 2000, "저도 먹고 싶어요");
        await s.say(U.jiwoo, "여기 파는 곳 알려 주세요");
        await s.say(U.doyun, "링크는 곧 올릴게요");
        await s.donate(U.jimin, 1000, "계속 응원해요");
      });
      await scene({ id: "seed-bc-boram-1", category: "그림", owner: U.boram, title: "예시 방송 · 보람의 그림 일기", hoursAgo: 65, recording: { video: 2, isPublic: false, shared: true } }, false, async (s) => {
        await s.say(U.boram, "그림 일기 그려요");
        await s.say(U.jimin, "색칠 예쁘다");
        await s.donate(U.jimin, 3000, "그림 잘 그리세요");
        await s.say(U.seoyeon, "저도 그려 보고 싶어요");
        await s.say(U.boram, "같이 그려요");
      });
      await scene({ id: "seed-bc-yerin-1", category: "음악", owner: U.yerin, title: "예시 방송 · 예린의 노래 연습", hoursAgo: 64, recording: { video: 1, isPublic: true, shared: true } }, false, async (s) => {
        await s.say(U.yerin, "노래 연습 시작해요");
        await s.say(U.jimin, "목소리 좋아요");
        await s.donate(U.jimin, 2000, "한 곡 더 불러 주세요");
        await s.say(U.jiwoo, "다음 곡은 뭐예요");
        await s.say(U.yerin, "잔잔한 노래로 할게요");
      });
    };
    await Promise.all([laneA(), laneB(), laneC()]); // 후원하는 사람과 받는 사람이 겹치지 않는 세 갈래를 동시에 돌린다
    log("지난 방송 13개");

    // 홈이 비어 보이지 않게 방송 중인 예시 방송 8개와 준비 중인 예시 방송 2개를 둔다. 테스트 방송자는 주인으로 쓰지 않는다(30분 제한).
    // 제재로 방송이 끝나는 계정(도윤, 보람, 태양, 지민)도 주인으로 쓰지 않는다.
    await Promise.all([
      liveScene({ id: "seed-bc-live-1", owner: U.harin, title: "예시 방송 · 저녁 메뉴 같이 정해요", category: "잡담", viewerCount: 128, sourceType: "camera", minutesAgo: 12 }, [
        [U.harin, "오늘 저녁 뭐 먹을지 같이 정해 봐요"], [U.viewer, "저는 떡볶이요!"], [U.jiwoo, "비 오는 날엔 칼국수죠"], [U.harin, "둘 다 좋네요, 투표해 볼까요"],
      ], [{ uid: U.taeyang, amount: 2000, message: "저는 칼국수 한 표요" }]),
      liveScene({ id: "seed-bc-live-2", owner: U.minsu, title: "예시 방송 · 랭크 게임 도전기", category: "게임", viewerCount: 2400, sourceType: "screen", minutesAgo: 35 }, [
        [U.minsu, "이번 판은 꼭 이길게요"], [U.seoyeon, "화이팅!"], [U.viewer, "방금 플레이 멋졌어요"], [U.minsu, "고마워요, 한 판 더 갑니다"], [U.jiwoo, "다음 판도 기대돼요"],
      ], [{ uid: U.jimin, amount: 1000, message: "이길 거예요" }]),
      liveScene({ id: "seed-bc-live-3", owner: U.jiwoo, title: "예시 방송 · 같이 공부해요", category: "공부", viewerCount: 37, sourceType: "screen", minutesAgo: 5 }, [
        [U.jiwoo, "오늘은 영어 단어 50개 외워요"], [U.seoyeon, "저도 같이 할게요"], [U.viewer, "집중 잘 되는 음악 추천해 주세요"], [U.broadcaster, "저도 공부하러 왔어요"],
      ], [{ uid: U.broadcaster, amount: 2000, message: "공부 화이팅" }, { uid: U.broadcaster, amount: 1000, message: "끝까지 응원해요" }]),
      liveScene({ id: "seed-bc-live-4", owner: U.seoyeon, title: "예시 방송 · 기타 연습 시간", category: "음악", viewerCount: 560, sourceType: "camera", minutesAgo: 48 }, [
        [U.seoyeon, "오늘은 쉬운 곡부터 쳐 볼게요"], [U.harin, "소리 좋아요"], [U.viewer, "어떤 곡이에요?"], [U.seoyeon, "잔잔한 곡이에요"],
      ], [{ uid: U.sora, amount: 1000, message: "기타 소리 좋아요" }]),
      liveScene({ id: "seed-bc-live-5", owner: U.haneul, title: "예시 방송 · 하늘달의 밤 수다", category: "잡담", viewerCount: 842, sourceType: "camera", minutesAgo: 22 }, [
        [U.haneul, "잠이 안 와서 켰어요"], [U.viewer, "저도 잠이 안 와요"], [U.jiwoo, "오늘 하루 어땠어요?"], [U.haneul, "다들 이야기해 봐요"], [U.admin, "늦은 시간까지 방송 고마워요"],
      ], [{ uid: U.admin, amount: 3000, message: "따뜻한 차 한 잔 하세요" }, { uid: U.admin, amount: 2000, message: "좋은 밤 보내세요" }]),
      liveScene({ id: "seed-bc-live-6", owner: U.sora, title: "예시 방송 · 신작 게임 첫 플레이", category: "게임", viewerCount: 15, sourceType: "screen", minutesAgo: 17 }, [
        [U.sora, "신작 게임을 처음 해 봐요"], [U.seoyeon, "어렵지 않아요?"], [U.viewer, "튜토리얼부터 보여 주세요"],
      ]),
      liveScene({ id: "seed-bc-live-7", owner: U.seojun, title: "예시 방송 · 새벽 공부 방송", category: "공부", viewerCount: 3, sourceType: "screen", minutesAgo: 29 }, [
        [U.seojun, "시험 공부를 시작해요"], [U.jiwoo, "같이 힘내요"],
      ]),
      liveScene({ id: "seed-bc-live-8", owner: U.yerin, title: "예시 방송 · 신청곡 받아요", category: "음악", viewerCount: 211, sourceType: "camera", minutesAgo: 9 }, [
        [U.yerin, "신청곡을 채팅으로 남겨 주세요"], [U.viewer, "잔잔한 곡 부탁해요"], [U.seoyeon, "저는 밝은 노래요"], [U.yerin, "순서대로 불러 볼게요"],
      ]),
      readyScene({ id: "seed-bc-ready-1", owner: U.harin, title: "예시 방송 · 곧 시작하는 요리 교실", category: "요리", minutesAgo: 3 }),
      readyScene({ id: "seed-bc-ready-2", owner: U.seoyeon, title: "예시 방송 · 홈트 같이 해요", category: "운동", minutesAgo: 8 }),
    ]);
    log("방송 중 예시 방송 8개, 준비 중 2개");

    // ---- 신고, 제재, 이의 제기. 운영 처리는 시드 실행자(테스트 운영자 계정)로 한다. 대상이 서로 달라 동시에 돌려도 된다.
    const sanctions = () => db().collection("sanctions");
    const rep = async (reporter: string, input: { targetType: "chat" | "broadcast" | "user"; targetId: string; broadcastId?: string; reason: "abuse" | "sexual" | "spam" | "impersonation" | "illegal" | "other"; detail: string }) =>
      mod.report(await viewerOf(reporter), input);
    /** 제재를 걸고 그 문서 ID를 찾는다(사유가 계정 안에서 겹치지 않는다). */
    const sanctionIdOf = async (uid: string, reason: string) => (await sanctions().where("userId", "==", uid).get()).docs.find((d) => d.data().reason === reason)!.id;
    const give = async (uid: string, input: { kind: "warning" | "chatBan" | "broadcastBan" | "suspend"; days?: number; reason: string }) => {
      await admin.sanction(runner, uid, input);
      return sanctionIdOf(uid, input.reason);
    };
    // 직접 써 넣는 값: 실제 함수는 끝나는 때가 미래라서 "끝남" 상태를 만들 수 없다. 시작과 끝을 과거로 돌린다.
    const pastSanction = async (id: string, uid: string, startDaysAgo: number, endDaysAgo: number) => {
      await sanctions().doc(id).update({ startAt: ts(Date.now() - startDaysAgo * DAY), endAt: ts(Date.now() - endDaysAgo * DAY) });
      await syncSanctionSummary(uid);
    };

    const flows: (() => Promise<unknown>)[] = [
      // 기존: 기각 1건, 제재 연습용 신고 4건, 민수게임 경고와 이의 대기, 정지 예시, 방송자 활동 제한
      async () => {
        await rep(V, { targetType: "chat", targetId: "seed-bc-harin-c3", broadcastId: "seed-bc-harin", reason: "abuse", detail: "" });
        await admin.resolve(runner, U.jiwoo, { action: "dismiss", reason: "위반이 확인되지 않아 기각했어요" });
        for (const r of PRACTICE_REPORTS) await createPracticeReport(r);
        await admin.sanction(runner, U.minsu, { kind: "warning", reason: "방송 중 부적절한 표현을 써서 경고해요" });
        const warning = (await sanctions().where("userId", "==", U.minsu).get()).docs[0]!;
        await appealUseCases.create(await viewerOf(U.minsu), warning.id, "농담으로 한 말이었어요. 앞으로 조심할 테니 경고를 풀어 주세요.");
        await admin.sanction(runner, U.suspended, { kind: "suspend", reason: "운영정책을 여러 번 어겨 영구 정지했어요(예시)" });
        const owner = await viewerOf(U.broadcaster);
        await mod.banChat(owner, { userId: U.seoyeon, duration: "7d", memo: "도배가 심했어요" });
        await mod.banChat(owner, { userId: U.taeyang, duration: "1d", memo: "다른 시청자를 놀렸어요" });
        await mod.banChat(owner, { userId: U.jimin, duration: "perm", memo: "같은 말을 계속 올렸어요" });
      },
      // 테스트 시청자: 접수 상태 신고 1건, 지난 제재 3건(경고 끝남, 채팅 금지 끝남, 방송 금지 해제). 지금 걸린 제재가 없어 테스트를 막지 않는다.
      // 끝난 채팅 금지는 이의 제기를 남겨 두어 심사자가 직접 눌러 볼 수 있다.
      async () => {
        await rep(V, { targetType: "user", targetId: U.minsu, reason: "abuse", detail: "방송 중에 시청자를 놀렸어요" });
        await give(V, { kind: "warning", reason: "채팅에서 다른 시청자와 말다툼을 해 경고해요" });
        await mod.ackWarnings(await viewerOf(V));
        await pastSanction(await give(V, { kind: "chatBan", days: 1, reason: "같은 말을 여러 번 올려 하루 동안 채팅을 막아요" }), V, 5, 4);
        await admin.revoke(runner, await give(V, { kind: "broadcastBan", days: 7, reason: "방송 제목에 다른 방송 주소를 적어 7일간 방송을 막아요" }), "주소가 아니라 예시 문구로 확인돼 해제해요");
        await mod.banChat(await viewerOf(V), { userId: U.jiwoo, duration: "1d", memo: "같은 질문을 계속 올렸어요" }); // 내 방송 관리의 활동 제한 탭
      },
      // 테스트 방송자: 지난 제재 2건(경고 끝남, 채팅 금지 끝남). 지금 걸린 제재가 없어 방송과 승급 시나리오를 막지 않는다.
      async () => {
        await give(U.broadcaster, { kind: "warning", reason: "방송 제목에 과장 표현을 써서 경고해요(예시)" });
        await mod.ackWarnings(await viewerOf(U.broadcaster));
        await pastSanction(await give(U.broadcaster, { kind: "chatBan", days: 1, reason: "다른 방송 채팅에 같은 말을 여러 번 올려 하루 동안 채팅을 막아요(예시)" }), U.broadcaster, 6, 5);
      },
      // 테스트 운영자: 자기 방송에 건 활동 제한 1건. 운영자에게는 제재를 걸 수 없어서 제재 내역은 비어 있는 게 맞다.
      async () => mod.banChat(await viewerOf(U.admin), { userId: U.taeyang, duration: "1d", memo: "안내 방송에서 장난 채팅을 계속 올렸어요" }),
      // 도윤: 방송 신고 3건(테스트 시청자와 테스트 방송자도 신고) → 방송 금지, 이의 대기
      async () => {
        const detail = ["수상한 사이트를 계속 광고해요", "같은 링크를 반복해서 올려요", "방송 내용이 광고 같아요"];
        await rep(V, { targetType: "broadcast", targetId: "seed-bc-doyun-1", reason: "illegal", detail: detail[0]! });
        await rep(U.jiwoo, { targetType: "broadcast", targetId: "seed-bc-doyun-1", reason: "spam", detail: detail[1]! });
        await rep(U.broadcaster, { targetType: "broadcast", targetId: "seed-bc-doyun-1", reason: "spam", detail: detail[2]! });
        await rep(U.admin, { targetType: "broadcast", targetId: "seed-bc-doyun-1", reason: "illegal", detail: "이용자로 보다가 광고 방송을 발견했어요" }); // 운영자의 신고 내역과 처리 결과 알림
        const reason = "방송 중 수상한 사이트를 반복해서 광고해 7일간 방송을 막아요";
        await admin.resolve(runner, U.doyun, { action: "sanction", reason, sanction: { kind: "broadcastBan", days: 7 } });
        await appealUseCases.create(await viewerOf(U.doyun), await sanctionIdOf(U.doyun, reason), "광고가 아니라 맛집 소개였어요. 다시 확인해 주세요.");
      },
      // 소라: 지난 경고(확인해서 끝남), 지난 채팅 금지(끝남), 채팅 신고 3건 → 채팅 금지 1일(적용 중)
      async () => {
        await give(U.sora, { kind: "warning", reason: "채팅에서 다른 시청자에게 시비를 걸어 경고해요" });
        await mod.ackWarnings(await viewerOf(U.sora)); // 경고는 안내를 본 뒤 "끝남"이 된다
        await pastSanction(await give(U.sora, { kind: "chatBan", days: 1, reason: "도배가 반복돼 하루 동안 채팅을 막아요" }), U.sora, 8, 7);
        await rep(V, { targetType: "chat", targetId: ids.soraA!, broadcastId: "seed-bc-haneul-1", reason: "abuse", detail: "방송을 깎아내려요" });
        await rep(U.taeyang, { targetType: "chat", targetId: ids.soraA!, broadcastId: "seed-bc-haneul-1", reason: "abuse", detail: "" });
        await rep(U.jimin, { targetType: "chat", targetId: ids.soraB!, broadcastId: "seed-bc-haneul-1", reason: "abuse", detail: "시청자를 비하해요" });
        await admin.resolve(runner, U.sora, { action: "sanction", reason: "방송 채팅에서 반복해서 비하 표현을 써 하루 동안 채팅을 막아요", sanction: { kind: "chatBan", days: 1 } });
      },
      // 보람: 사용자 신고 3건 → 영구 정지(정산은 보류로 바뀐다)
      async () => {
        await rep(U.taeyang, { targetType: "user", targetId: U.boram, reason: "illegal", detail: "방송 밖에서 다른 사람을 속여 돈을 받았대요" });
        await rep(U.jimin, { targetType: "user", targetId: U.boram, reason: "impersonation", detail: "운영자를 사칭했어요" });
        await rep(U.seoyeon, { targetType: "user", targetId: U.boram, reason: "abuse", detail: "" });
        await admin.resolve(runner, U.boram, { action: "sanction", reason: "운영정책을 여러 번 어기고 다른 이용자를 속여 영구 정지해요", sanction: { kind: "suspend" } });
      },
      // 하늘달: 사용자 신고는 기각, 방송 신고는 "콘텐츠만 숨기기"(끝난 방송이라 다시보기가 비공개로 바뀜)
      async () => {
        await rep(U.sora, { targetType: "user", targetId: U.haneul, reason: "other", detail: "그냥 기분이 나빴어요" });
        await admin.resolve(runner, U.haneul, { action: "dismiss", reason: "신고 내용만으로는 위반을 확인할 수 없어요" });
        await rep(U.seoyeon, { targetType: "broadcast", targetId: "seed-bc-haneul-2", reason: "spam", detail: "방송 내용이 광고 같아요" });
        await admin.resolve(runner, U.haneul, { action: "hide", reportId: `${U.seoyeon}_broadcast_seed-bc-haneul-2`, reason: "광고 문구가 길게 나와 다시보기를 비공개로 바꿔요" });
      },
      // 태양: 채팅 금지 → 이의 받아들임(이의로 취소), 영구 정지 → 해제(정산 보류도 풀어 준다)
      async () => {
        const ban = await give(U.taeyang, { kind: "chatBan", days: 7, reason: "채팅방에서 다른 시청자를 놀려 7일간 채팅을 막아요" });
        await appealUseCases.create(await viewerOf(U.taeyang), ban, "장난으로 한 말이었어요. 이제 하지 않을게요.");
        await appealUseCases.resolve(runner, ban, { accept: true, answer: "사정을 확인해 채팅 금지를 풀어요" });
        const susp = await give(U.taeyang, { kind: "suspend", reason: "결제 도용이 의심돼 임시로 영구 정지해요(확인 뒤 해제)" });
        await admin.revoke(runner, susp, "확인 결과 문제가 없어 해제해요");
        await settlements.release(runner, U.taeyang, "정지를 풀어 정산 보류도 풀어요");
      },
      // 지민: 경고 → 이의 받아들임, 방송 금지 → 이의 거절 → 기간 끝남, 채팅 금지 → 해제
      async () => {
        const w = await give(U.jimin, { kind: "warning", reason: "채팅에서 다른 방송을 홍보해 경고해요" });
        await appealUseCases.create(await viewerOf(U.jimin), w, "홍보가 아니라 안내였어요. 경고를 풀어 주세요.");
        await appealUseCases.resolve(runner, w, { accept: true, answer: "내용을 다시 보니 홍보가 아니라서 취소해요" });
        const bb = await give(U.jimin, { kind: "broadcastBan", days: 7, reason: "방송 제목에 과장 표현을 써서 7일간 방송을 막아요" });
        await appealUseCases.create(await viewerOf(U.jimin), bb, "제목은 장난이었고 방송 내용은 문제가 없었어요.");
        await appealUseCases.resolve(runner, bb, { accept: false, answer: "제목이 이용자를 속일 수 있어 제재를 유지해요" });
        await pastSanction(bb, U.jimin, 10, 3);
        const cb = await give(U.jimin, { kind: "chatBan", days: 1, reason: "채팅방 도배로 하루 동안 채팅을 막아요" });
        await admin.revoke(runner, cb, "도배가 오해로 확인돼 해제해요");
      },
    ];

    // ---- 환급과 충전 기록. 환급은 7일이 지난 충전에서만 되므로 충전 시각을 10일 전으로 돌린다(직접 쓰는 값).
    const aged = async (uid: string, amount: number) => backdateCharge(await charge(uid, amount), 10 * DAY);
    const refundOf = async (uid: string, requestId: string, last: string) => {
      await refunds.apply(await viewerOf(uid), { requestId, bank: "테스트은행", accountNumber: `110123${last}` });
    };
    const pendingTag = (id: string) => tagNow(db().collection("refunds").doc(id));
    const money: (() => Promise<unknown>)[] = [
      () => backdateCharge(practiceCharge, 10 * DAY), // 7일이 지난 충전이라 취소는 안 되고 환급 신청은 된다
      // 소라: 환급 완료 1건, 환급 대기 1건
      async () => {
        await aged(U.sora, 8_000);
        await refundOf(U.sora, "seed-refund-sora-1", "1111");
        await refunds.approve(runner, "seed-refund-sora-1");
        await aged(U.sora, 10_000);
        await refundOf(U.sora, "seed-refund-sora-2", "1111");
        await pendingTag("seed-refund-sora-2");
      },
      // 태양: 환급 완료 1건, 환급 거절 1건
      async () => {
        await aged(U.taeyang, 10_000);
        await refundOf(U.taeyang, "seed-refund-taeyang-1", "2222");
        await refunds.approve(runner, "seed-refund-taeyang-1");
        await aged(U.taeyang, 5_000);
        await refundOf(U.taeyang, "seed-refund-taeyang-2", "2222");
        await refunds.reject(runner, "seed-refund-taeyang-2", "계좌 정보가 본인 이름과 달라 환급할 수 없어요");
      },
      // 지민: 환급 거절 1건, 송금 실패 1건. 충전 기록도 실패, 결제 대기(방금), 결제 대기(30분 넘음)를 만든다.
      async () => {
        await aged(U.jimin, 5_000);
        await refundOf(U.jimin, "seed-refund-jimin-1", "3333");
        await refunds.reject(runner, "seed-refund-jimin-1", "신청 내용을 확인할 수 없어 거절해요");
        await refundOf(U.jimin, "seed-refund-jimin-2", "3333");
        await pendingTag("seed-refund-jimin-2"); // 송금 실패도 처리 중 상태라 먼저 표시한다
        await failingRefunds.approve(runner, "seed-refund-jimin-2");
      },
      async () => {
        const v = await viewerOf(U.jimin);
        const failed = await honey.createCharge(v, { honey: 2_000 });
        await honey.failCharge(v, failed.orderId); // 결제창에서 실패
        const fresh = await honey.createCharge(v, { honey: 5_000 });
        await tagNow(db().collection("charges").doc(fresh.orderId)); // 방금 만든 결제 대기
        const stale = await honey.createCharge(v, { honey: 3_000 });
        await tagNow(db().collection("charges").doc(stale.orderId));
        // 직접 써 넣는 값: 결제 대기를 45분 전에 만든 것으로 돌린다(30분이 넘으면 멈춘 주문으로 본다).
        await db().collection("charges").doc(stale.orderId).update({ createdAt: ts(Date.now() - 45 * 60_000) });
      },
    ];
    await Promise.all([...flows, ...money].map((f) => f()));
    log("신고, 제재, 이의 제기, 환급, 충전 기록");

    // ---- 정산. 월 정산 테스트 실행을 실제 함수로 한다. 기준 시각을 61시간 전으로 줘서 새 샘플 방송자의 후원만 들어가게 한다.
    // 그래야 테스트 방송자, 제재 연습용, 하린방송, 민수게임의 후원은 정산되지 않은 채 남아 심사 시나리오(10-8)가 그대로 된다.
    await settlements.hold(runner, U.seojun, "정산 정보를 확인하는 동안 지급을 보류해요");
    const prevEnv = process.env.ENABLE_SETTLEMENT_TEST;
    process.env.ENABLE_SETTLEMENT_TEST = "true"; // 이 프로세스에서만, 이 호출 동안만 켠다
    try {
      await settlements.runTest(runner, SEED_TEST_RUN, new Date(Date.now() - 61 * HOUR));
    } finally {
      if (prevEnv === undefined) delete process.env.ENABLE_SETTLEMENT_TEST;
      else process.env.ENABLE_SETTLEMENT_TEST = prevEnv;
    }
    await settlements.release(runner, U.seojun, "정산 정보를 확인해 보류를 풀어요"); // 보류(운영 조치)가 지급 대기로 돌아온다
    await db().collection("jobRuns").doc(SEED_TEST_RUN).update({ seedData: true });

    // 직접 써 넣는 값: 지난 예약 실행 기록. 실제 예약 실행은 지난달 후원 전부를 정산해서, 실행한 날에 따라 심사용 계정의 후원까지 정산해 버린다. 그래서 기록만 만든다.
    const monthStart = kstMonthStartOf(new Date());
    const prevMonthStart = kstMonthStartOf(new Date(monthStart.getTime() - DAY));
    const past = (id: string, mode: "scheduled" | "test", at: Date, streamerCount: number, result: string, adminNickname: string | null) =>
      db().collection("jobRuns").doc(id).set({
        jobName: "monthlySettlement", mode, adminId: adminNickname ? U.admin : null, adminNickname,
        startedAt: ts(Math.min(at.getTime(), Date.now())), endedAt: ts(Math.min(at.getTime() + 41_000, Date.now())), streamerCount, result, seedData: true,
      });
    await Promise.all([
      past("seed-job-scheduled-1", "scheduled", new Date(monthStart.getTime() + 5 * 60_000), 5, testRunMessage({ newDonations: 41, newShare: 96_300, paidCount: 4, heldCount: 1 }), null),
      past("seed-job-scheduled-2", "scheduled", new Date(prevMonthStart.getTime() + 5 * 60_000), 4, `${testRunMessage({ newDonations: 27, newShare: 61_800, paidCount: 2, heldCount: 1 })} (실패 1명)`, null),
      past("seed-job-test-1", "test", new Date(prevMonthStart.getTime() + 20 * DAY), 2, testRunMessage({ newDonations: 6, newShare: 11_200, paidCount: 2, heldCount: 0 }), "테스트운영자"),
      // 직접 써 넣는 값: 테스트 방송자의 지지난달 정산 1건(지난달 예약 실행의 결과). 연결된 후원은 없다.
      // 지금 남은 후원 6건은 정산되지 않은 채라 "첫 정산을 심사자가 직접 해 본다"(10-8)는 그대로 된다.
      db().collection("settlements").doc("seed-settle-broadcaster-prev").set({
        streamerId: U.broadcaster, periodStart: ts(kstMonthStartOf(new Date(prevMonthStart.getTime() - DAY)).getTime()), periodEnd: ts(prevMonthStart.getTime()), mode: "scheduled",
        donationCount: 4, honey: 9_000, streamerShare: 7_200, nabiShare: 1_800, deduction: 0, tax: 0, payout: 7_200,
        status: "paid", holdReason: null, heldBy: null, payoutDate: ts(prevMonthStart.getTime() + 24 * DAY), paidAt: ts(prevMonthStart.getTime() + 24 * DAY),
        transferId: "MOCK-SEED-PREV-1234", mock: true, hasSameIdentity: false, createdAt: ts(prevMonthStart.getTime() + 5 * 60_000), seedData: true,
      }),
    ]);

    // 운영자가 더한 금칙어 몇 개(운영 기록이 남는다). 이미 있으면 다시 더하지 않는다. 금칙어 목록은 시드 초기화가 지우지 않는 설정이다.
    for (const w of ["먹튀", "불법토토", "도박사이트"]) await bannedWordsAdmin.change(runner, w, true).catch(() => undefined);

    // 테스트 방송자 알림: 후원 받음 6건 가운데 최근 3건만 읽지 않은 채로 두고, 신고 처리 결과는 읽지 않은 채로 둔다.
    const broadcaster = await viewerOf(U.broadcaster);
    const notes = notificationUseCases();
    for (const n of (await notes.list(broadcaster)).items.filter((x) => x.kind === "donation").slice(3)) await notes.read(broadcaster, n.id);

    await tagSeedDocs();
  }

  // ---- 부분 초기화(4-18)
  /** 꿀 잔액을 목표 값으로 맞춘다. 줄일 때는 꿀 내역에 "시드 조정" 줄을, 늘릴 때는 승인 시각이 10일 전인 시드 결제 충전을 만든다. */
  async function setHoney(uid: string, target: number) {
    await db().runTransaction(async (tx) => {
      const [w, cs] = await Promise.all([tx.get(walletRef(uid)), tx.get(db().collection("charges").where("userId", "==", uid).where("status", "==", "done").orderBy("approvedAt"))]);
      const balance = (w.data()?.balance as number | undefined) ?? 0;
      const now = Timestamp.now();
      if (balance > target) {
        const usage = allocateFifo(cs.docs.map((c) => ({ id: c.id, remaining: c.data().remaining as number, approvedAtMs: (c.data().approvedAt as Timestamp).toMillis() })), balance - target);
        if (!usage) throw conflict("SEED_MISMATCH", "꿀 기록이 맞지 않아 줄일 수 없어요");
        for (const u of usage) tx.update(db().collection("charges").doc(u.chargeId), { remaining: FieldValue.increment(-u.amount) });
        tx.create(db().collection("honeyLedger").doc(), { userId: uid, type: "seedAdjust", amount: target - balance, createdAt: now, seedData: true });
        bumpWallet(tx, uid, w.exists, { balance: target - balance });
      } else if (balance < target) {
        const diff = target - balance;
        const at = ts(now.toMillis() - 10 * DAY);
        const ref = db().collection("charges").doc(`seed_${uid}_${now.toMillis()}`);
        tx.create(ref, {
          userId: uid,
          honey: diff,
          amount: payAmount(diff),
          remaining: diff,
          status: "done",
          createdAt: at,
          approvedAt: at,
          cancelableUntil: ts(at.toMillis() + CANCEL_WINDOW_MS),
          returnTo: null,
          donation: null,
          paymentKey: `seed_pay_${ref.id}`,
          result: { status: "none" },
          seedData: true,
        });
        tx.create(db().collection("honeyLedger").doc(), { userId: uid, type: "charge", amount: diff, chargeId: ref.id, createdAt: at, seedData: true });
        bumpWallet(tx, uid, w.exists, { balance: diff });
      }
    });
  }

  /** 실제 운영자가 건 제재를 푼다(06 결정 29). 시드가 만든 제재(표시가 있는 것)는 그대로 둔다. */
  async function releaseRealSanctions(uids: string[]) {
    for (const uid of uids) {
      const snap = await db().collection("sanctions").where("userId", "==", uid).get();
      const mine = snap.docs.filter((d) => d.data().status === "active" && !d.data().seedData);
      if (!mine.length) continue;
      for (const d of mine) await d.ref.update({ status: "revoked", revokeReason: "심사용 초기화" });
      await syncSanctionSummary(uid);
      if (mine.some((d) => d.data().kind === "suspend")) {
        await adminAuth().updateUser(uid, { disabled: false });
        await users().doc(uid).update({ settlementHold: false, settlementHoldReason: null });
      }
    }
  }

  const reportRef = (r: (typeof PRACTICE_REPORTS)[number]) => db().collection("reports").doc(`${r.reporter}_${r.targetType}_${r.targetId}`);

  async function resetViewer() {
    await setHoney(U.viewer, 0);
    await db().collection("users").doc(U.broadcaster).collection("chatBans").doc(U.viewer).delete(); // 테스트 방송자가 건 활동 제한
    await users().doc(U.viewer).update({ lastPartialResetAt: Timestamp.now() }); // 하루 충전 한도는 이 시각부터 다시 센다(06 결정 27)
  }

  async function resetBroadcaster() {
    await writeGrade(U.broadcaster, "egg", 0.8, { broadcastCount: 2, totalBroadcastMs: 2 * HOUR, donationReceivedCount: 6 }, "심사용 초기화");
    await users().doc(U.broadcaster).update({ lastPartialResetAt: Timestamp.now() });
  }

  async function resetPractice() {
    const runner = seedRunner();
    const rs = (await db().collection("refunds").where("userId", "==", U.practice).get()).docs;
    if (rs.some((d) => d.data().status === "sending")) throw conflict("REFUND_SENDING", "송금 중인 환급 신청이 있어 지금은 되돌릴 수 없어요. 잠시 뒤에 다시 눌러 주세요");
    for (const d of rs.filter((x) => ["pending", "failed"].includes(x.data().status))) await refunds.reject(runner, d.id, "심사용 초기화");

    // 제재를 모두 풀고, 영구 정지였다면 계정 정지도 푼다.
    const sanctions = (await db().collection("sanctions").where("userId", "==", U.practice).get()).docs.filter((d) => d.data().status === "active");
    for (const d of sanctions) await d.ref.update({ status: "revoked", revokeReason: "심사용 초기화" });
    await syncSanctionSummary(U.practice);
    if (sanctions.some((d) => d.data().kind === "suspend")) await adminAuth().updateUser(U.practice, { disabled: false });
    await users().doc(U.practice).update({ settlementHold: false, settlementHoldReason: null });
    await db().collection("users").doc(U.broadcaster).collection("chatBans").doc(U.practice).delete();

    // 신고 4건은 새로 만들지 않고 처음 만든 문서를 "접수"로 되돌린다.
    for (const r of PRACTICE_REPORTS) {
      const ref = reportRef(r);
      if (!(await ref.get()).exists) await createPracticeReport(r);
      else await ref.update({ status: "pending", processedBy: FieldValue.delete(), processReason: FieldValue.delete(), processedAt: FieldValue.delete() });
    }
    await syncReportTarget(U.practice);
    // 운영자가 "콘텐츠만 숨기기"로 숨긴 채팅은 원문을 되돌린다.
    for (const id of PRACTICE_CHATS) {
      const hidden = db().collection("hiddenComments").doc(id);
      const h = (await hidden.get()).data();
      if (h?.word === "운영자 숨김") {
        await db().collection("broadcasts").doc("seed-bc-test-a").collection("comments").doc(id).update({ hidden: false, content: h.content });
        await hidden.delete();
      }
    }

    await setHoney(U.practice, 5000);
    await users().doc(U.practice).update({ lastPartialResetAt: Timestamp.now() });

    // 정지 예시 계정은 영구 정지를 다시 건다.
    const banned = (await db().collection("sanctions").where("userId", "==", U.suspended).get()).docs.some((d) => d.data().kind === "suspend" && d.data().status === "active");
    if (!banned) await admin.sanction(runner, U.suspended, { kind: "suspend", reason: "운영정책을 여러 번 어겨 영구 정지했어요(예시)" });
    await adminAuth().updateUser(U.suspended, { disabled: true });
  }

  // ---- 전체 초기화(4-18)
  async function runReset(who: Viewer, action: string) {
    const stamp = Timestamp.now();
    await db().runTransaction(async (tx) => {
      if (isLocked((await tx.get(state())).data())) throw conflict("SEED_RESETTING", "이미 테스트 계정을 초기화하는 중이에요");
      tx.set(state(), { resetting: true, resettingAt: stamp, startedBy: who.uid }, { merge: true });
    });
    try {
      // 먼저 방송 중인 시드 방송을 끝낸다. 그다음 진행 중인 돈 처리가 있으면 거절한다.
      for (const d of await byUsers("broadcasts", "ownerId")) if (d.data().status === "live") await deps.end(d.id);
      const why = await blockers();
      if (why.length) throw new AppError(409, "SEED_BLOCKED", `지금은 초기화할 수 없어요. ${why.join(". ")}. 끝난 뒤에 다시 눌러 주세요`);
      log("지우는 중");
      await wipe();
      const videoSources: [string, number][] = [["testsrc", 440], ["testsrc2", 523], ["smptebars", 659]];
      videos.length = 0;
      videos.push(...videoSources.map(([src, hz]) => makeVideo(src, hz)));
      if (videos.some((v) => !v)) log("ffmpeg가 없거나 실패해서 다시보기 예시 영상 없이 만들어요(녹화 기록만 있고 재생은 되지 않아요)");
      try {
        await build();
      } finally {
        await tagSeedDocs().catch(() => undefined); // 중간에 실패해도 만든 기록에 표시를 붙여, 다음 초기화가 막히지 않게 한다
      }
      await writeAdminLog(who, { action, targetType: "seed", targetId: "all", targetNickname: "테스트 계정", targetSeed: true, reason: "", before: "", after: "시드 계정 17개를 처음부터 다시 만들었어요" });
      await state().set({ lastFullResetAt: Timestamp.now(), lastFullResetBy: who.uid }, { merge: true });
    } finally {
      await state().set({ resetting: false }, { merge: true });
    }
  }

  return {
    /** `pnpm seed`와 `pnpm seed --reset`. 시드 실행자로 처음부터 다시 만든다. 여러 번 돌려도 같은 결과다. */
    rebuild: () => runReset(seedRunner(), "테스트 계정 시드 실행"),

    /** 운영자 화면의 "전체 초기화". 테스트 운영자는 10분에 한 번만 할 수 있다(06 결정 25). */
    async fullReset(adminViewer: Viewer) {
      const last = ((await state().get()).data()?.lastFullResetAt as Timestamp | undefined)?.toMillis();
      if (adminViewer.user.isTestAdmin && last && Date.now() - last < FULL_RESET_INTERVAL_MS) {
        throw new AppError(429, "RESET_TOO_SOON", "조금 뒤에 다시 초기화할 수 있어요");
      }
      await runReset(adminViewer, "테스트 계정 전체 초기화");
      return { message: "테스트 계정을 처음 상태로 다시 만들었어요" };
    },

    /** 운영자 화면의 부분 초기화 버튼. 기록은 지우지 않고 상태만 되돌린다. */
    async partialReset(adminViewer: Viewer, target: keyof typeof SEED_TARGET_LABEL) {
      if (isLocked((await state().get()).data())) throw conflict("SEED_RESETTING", "테스트 계정을 초기화하는 중이에요. 잠시 뒤에 다시 눌러 주세요");
      if (target === "viewer") await resetViewer();
      else if (target === "broadcaster") await resetBroadcaster();
      else await resetPractice();
      await releaseRealSanctions([U.broadcaster, U.viewer, ...SAMPLE_UIDS]);
      await writeAdminLog(adminViewer, { action: "테스트 계정 부분 초기화", targetType: "seed", targetId: target, targetNickname: SEED_TARGET_LABEL[target], targetSeed: true, reason: "", before: "", after: "되돌림" });
      return { message: `${SEED_TARGET_LABEL[target]} 되돌렸어요` };
    },

    /** 운영자 화면의 계정 표 */
    async list(adminViewer: Viewer) {
      const [docs, wallets, st] = await Promise.all([db().getAll(...ALL.map((uid) => users().doc(uid))), db().getAll(...ALL.map((uid) => walletRef(uid))), state().get()]);
      const accounts = docs.flatMap((d, i): SeedAccount[] => {
        const u = d.data();
        if (!u) return [];
        return [
          {
            uid: d.id,
            nickname: u.nickname,
            kind: SEED_KIND_LABEL[u.seedKind] ?? u.seedKind ?? "",
            grade: u.grade,
            honey: (wallets[i]!.data()?.balance as number | undefined) ?? 0,
            broadcastCount: u.broadcastCount ?? 0,
            totalBroadcastMs: u.totalBroadcastMs ?? 0,
            donationCount: u.donationReceivedCount ?? 0,
            suspended: !!u.suspended,
            chatBannedUntil: iso(u.chatBannedUntil),
          },
        ];
      });
      const s = st.data();
      const last = (s?.lastFullResetAt as Timestamp | undefined)?.toMillis() ?? null;
      const next = adminViewer.user.isTestAdmin && last && last + FULL_RESET_INTERVAL_MS > Date.now() ? new Date(last + FULL_RESET_INTERVAL_MS).toISOString() : null;
      return { accounts, resetting: isLocked(s), lastFullResetAt: last ? new Date(last).toISOString() : null, nextFullResetAt: next };
    },
  };
}
