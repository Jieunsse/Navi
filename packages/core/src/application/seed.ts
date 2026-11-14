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
import { createStorage, type StoragePort } from "../adapters/storage.ts";
import { allocateFifo } from "../domain/honey.ts";
import { chunk } from "../domain/settlement.ts";
import { AppError, conflict } from "../errors.ts";
import { createUserDocs } from "./account.ts";
import { adminUseCases } from "./admin.ts";
import { appealUseCases } from "./appeal.ts";
import type { UserDoc, Viewer } from "./auth.ts";
import { broadcastUseCases } from "./broadcast.ts";
import { chatUseCases } from "./chat.ts";
import { walletRef, bumpWallet } from "./donation.ts";
import { honeyUseCases } from "./honey.ts";
import { missionUseCases } from "./mission.ts";
import { moderationUseCases, syncSanctionSummary, writeAdminLog } from "./moderation.ts";
import { notificationUseCases } from "./notification.ts";
import { recordingUseCases } from "./recording.ts";
import { refundUseCases } from "./refund.ts";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ALL: string[] = Object.values(U);
const SEEDED = new Set<string>(ALL);
const state = () => db().collection("config").doc("seedState");
const users = () => db().collection("users");

/** 계정 9개(4-18). 샘플 계정과 버튼 계정은 비밀번호를 무작위로 만들어 어디에도 적지 않는다. */
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
];

// 본인인증(목업) 값. 이름·생년월일·번호는 모두 지어낸 값이고, 명의가 서로 달라야 "같은 명의" 규칙에 걸리지 않는다.
const IDENTITIES: Record<string, { name: string; birth: string; phone: string }> = {
  [U.viewer]: { name: "테스트시청", birth: "1990-01-01", phone: "01000000001" },
  [U.practice]: { name: "연습시청", birth: "1992-02-02", phone: "01000000002" },
  [U.jiwoo]: { name: "김지우", birth: "1995-05-05", phone: "01000000003" },
  [U.seoyeon]: { name: "박서연", birth: "1996-06-06", phone: "01000000004" },
};
const PAYOUTS: Record<string, { last4: string; holder: string }> = {
  [U.broadcaster]: { last4: "1234", holder: "테스트방송" },
  [U.practice]: { last4: "5678", holder: "연습시청" },
  [U.harin]: { last4: "9012", holder: "하린" },
}; // 민수게임은 계좌가 없다(정산 보류 "정산 정보 없음"을 보여주기 위해)

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
    const don = [...(await byUsers("donations", "donorId")), ...(await byUsers("donations", "streamerId"))];
    if (don.some((d) => d.data().kind === "mission" && ["pending", "active"].includes(d.data().missionStatus))) out.push("대기 중이거나 진행 중인 미션이 있어요");
    // 만든 지 30분이 넘은 결제 대기는 하루 한도에도 세지 않는 멈춘 주문이라 막지 않는다.
    const stale = Date.now() - PENDING_CHARGE_MS;
    const charges = await byUsers("charges", "userId");
    if (charges.some((d) => d.data().status === "canceling" || (d.data().status === "pending" && d.data().createdAt.toMillis() > stale))) out.push("결제 대기나 취소 중인 충전이 있어요");
    if ((await byUsers("refunds", "userId")).some((d) => ["pending", "sending", "failed"].includes(d.data().status))) out.push("처리 중인 환급 신청(대기, 송금 중, 송금 실패)이 있어요");
    if ((await byUsers("settlements", "streamerId")).some((d) => d.data().status === "sending")) out.push("송금 중인 정산 기록이 있어요");
    return out;
  }

  /** 시드 계정이 주인인 문서를 지운다. 실제 사용자가 얽힌 후원은 남기고 시드 쪽 이름만 바꾼다. 운영 기록과 Firebase 계정은 건드리지 않는다. */
  async function wipe() {
    const fs = db();
    const owned = await byUsers("broadcasts", "ownerId");
    for (const part of chunk(owned.map((d) => d.id), 30)) await removeDocs((await fs.collection("hiddenComments").where("broadcastId", "in", part).get()).docs);
    await removeDocs(await byUsers("recordings", "ownerId"));
    for (const d of owned) await fs.recursiveDelete(d.ref); // 채팅 등 하위 문서까지

    const donations = new Map<string, QueryDocumentSnapshot>();
    for (const f of ["donorId", "streamerId"]) for (const d of await byUsers("donations", f)) donations.set(d.id, d);
    const gone: QueryDocumentSnapshot[] = [];
    for (const d of donations.values()) {
      const x = d.data();
      const donor = SEEDED.has(x.donorId);
      const streamer = SEEDED.has(x.streamerId);
      if (donor && streamer) gone.push(d);
      else await d.ref.update({ ...(donor && { donorNickname: SEED_RENAMED }), ...(streamer && { streamerNickname: SEED_RENAMED, settlementId: null }) });
    }
    await removeDocs(gone);

    for (const [col, field] of [["charges", "userId"], ["honeyLedger", "userId"], ["refunds", "userId"], ["reports", "reporterId"], ["sanctions", "userId"], ["appeals", "userId"], ["settlements", "streamerId"], ["nicknames", "uid"]] as const) {
      await removeDocs(await byUsers(col, field));
    }
    for (const col of ["wallets", "identityVerifications", "payoutAccounts"]) await removeDocs(ALL.map((uid) => ({ ref: fs.collection(col).doc(uid) })));
    for (const uid of ALL) await fs.recursiveDelete(users().doc(uid)); // 알림, 등급 변경 내역, 활동 제한 포함
  }

  // ---- 만들기(4-18)
  async function ensureAccounts() {
    for (const a of ACCOUNTS) {
      const email = a.login?.email ?? `${a.uid}@nabi.test`;
      const password = a.login?.password ?? crypto.randomUUID();
      const exists = await adminAuth().getUser(a.uid).then(() => true, () => false);
      if (exists) await adminAuth().updateUser(a.uid, { email, password, disabled: false });
      else await adminAuth().createUser({ uid: a.uid, email, password, emailVerified: true });
      await createUserDocs(a.uid, a.nickname, email, { seedKind: a.seedKind, seedData: true, ...a.extra });
    }
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
  type SceneSpec = { id: string; owner: string; title: string; hoursAgo: number; recording?: { video: number; isPublic: boolean } };
  const videos: (Uint8Array | null)[] = [];

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
      const storageKey = `recordings/seed/${recordingId}.mp4`;
      const video = videos[spec.recording.video];
      if (video) await storage.put(storageKey, video, "video/mp4").catch((e) => log(`영상 올리기 실패(${recordingId}): ${e instanceof Error ? e.message : e}`));
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
  async function liveScene(spec: { id: string; owner: string; title: string; sourceType: "screen" | "camera"; minutesAgo: number }, lines: [string, string][]) {
    const bref = db().collection("broadcasts").doc(spec.id);
    const owner = await viewerOf(spec.owner);
    const now = Timestamp.now();
    const startMs = now.toMillis() - spec.minutesAgo * 60_000;
    await bref.set({
      ownerId: owner.uid,
      ownerNickname: owner.user.nickname,
      title: spec.title,
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
    for (const [col, f] of targets) for (const d of await byUsers(col, f)) refs.set(d.ref.path, d.ref);
    const byId = ["wallets", "identityVerifications"].flatMap((col) => ALL.map((uid) => db().collection(col).doc(uid)));
    for (const s of await db().getAll(...byId)) if (s.exists) refs.set(s.ref.path, s.ref); // 없는 문서는 만들지 않는다
    for (const part of chunk([...refs.values()], 400)) {
      const b = db().batch();
      part.forEach((r) => b.update(r, { seedData: true }));
      await b.commit();
    }
  }

  async function build() {
    await ensureAccounts();
    log("계정 9개 준비");
    for (const [uid, i] of Object.entries(IDENTITIES)) await honey.verifyIdentity(await viewerOf(uid), i);
    const payoutAt = Timestamp.now();
    for (const [uid, p] of Object.entries(PAYOUTS)) await db().collection("payoutAccounts").doc(uid).set({ bank: "테스트은행", last4: p.last4, holder: p.holder, test: true, registeredAt: payoutAt, seedData: true });

    // 샘플 방송자의 등급과 통계는 직접 쓴다. 후원을 받기 전에 써야 그 후원에 등급 비율이 맞게 붙는다.
    await writeGrade(U.harin, "pupa", 0.85, { broadcastCount: 16, totalBroadcastMs: 22 * HOUR, donationReceivedCount: 34 });
    await writeGrade(U.minsu, "larva", 0.82, { broadcastCount: 4, totalBroadcastMs: 3 * HOUR, donationReceivedCount: 0 });

    await Promise.all([U.viewer, U.jiwoo, U.seoyeon].map((uid) => charge(uid, 10_000)));
    const practiceCharge = await charge(U.practice, 10_000);
    log("충전 4건");

    const V = U.viewer;
    await scene({ id: "seed-bc-test-a", owner: U.broadcaster, title: "예시 방송 · 첫 게임 데이", hoursAgo: 50, recording: { video: 0, isPublic: true } }, true, async (s) => {
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

    await scene({ id: "seed-bc-test-b", owner: U.broadcaster, title: "예시 방송 · 그림 그리기", hoursAgo: 30, recording: { video: 0, isPublic: false } }, true, async (s) => {
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

    await scene({ id: "seed-bc-practice", owner: U.practice, title: "예시 방송 · 연습용 시청자의 방송", hoursAgo: 20 }, true, async (s) => {
      await s.say(U.practice, "처음 방송해 봅니다");
      await s.say(U.seoyeon, "안녕하세요!");
      await s.donate(U.seoyeon, 1000, "재밌어요!");
      await s.say(U.jiwoo, "응원하러 왔어요");
      await s.donate(U.seoyeon, 2000, "응원해요");
    });

    await scene({ id: "seed-bc-harin", owner: U.harin, title: "예시 방송 · 하린의 요리 시간", hoursAgo: 60, recording: { video: 1, isPublic: true } }, false, async (s) => {
      await s.say(U.harin, "오늘은 파스타를 만들어요");
      await s.say(U.seoyeon, "맛있겠다");
      await s.say(U.jiwoo, "이 방송 별로네요 보지 마세요"); // c3 (테스트 시청자가 신고, 기각됨)
      await s.say(V, "재료가 뭐예요?");
      await s.donate(U.practice, 3000, "맛있겠다");
      await s.say(U.harin, "토마토랑 마늘이에요");
      await s.donate(U.practice, 2000, "다음에도 올게요");
    });

    await scene({ id: "seed-bc-minsu", owner: U.minsu, title: "예시 방송 · 민수의 게임 방송", hoursAgo: 40, recording: { video: 2, isPublic: true } }, false, async (s) => {
      await s.say(U.minsu, "랭크 게임 시작합니다");
      await s.say(U.jiwoo, "화이팅");
      await s.donate(U.jiwoo, 1000, "화이팅");
      await s.say(U.seoyeon, "이번 판 이길 수 있어요");
      await s.donate(U.jiwoo, 2000, "잘 보고 가요");
    });
    log("지난 방송 5개");

    // 홈이 비어 보이지 않게 방송 중인 예시 방송 4개를 둔다. 테스트 방송자는 주인으로 쓰지 않는다(30분 제한).
    await liveScene({ id: "seed-bc-live-1", owner: U.harin, title: "예시 방송 · 저녁 메뉴 같이 정해요", sourceType: "camera", minutesAgo: 12 }, [
      [U.harin, "오늘 저녁 뭐 먹을지 같이 정해 봐요"],
      [U.viewer, "저는 떡볶이요!"],
      [U.jiwoo, "비 오는 날엔 칼국수죠"],
      [U.harin, "둘 다 좋네요, 투표해 볼까요"],
    ]);
    await liveScene({ id: "seed-bc-live-2", owner: U.minsu, title: "예시 방송 · 랭크 게임 도전기", sourceType: "screen", minutesAgo: 35 }, [
      [U.minsu, "이번 판은 꼭 이길게요"],
      [U.seoyeon, "화이팅!"],
      [U.viewer, "방금 플레이 멋졌어요"],
      [U.minsu, "고마워요, 한 판 더 갑니다"],
      [U.jiwoo, "다음 판도 기대돼요"],
    ]);
    await liveScene({ id: "seed-bc-live-3", owner: U.jiwoo, title: "예시 방송 · 같이 공부해요", sourceType: "screen", minutesAgo: 5 }, [
      [U.jiwoo, "오늘은 영어 단어 50개 외워요"],
      [U.seoyeon, "저도 같이 할게요"],
      [U.viewer, "집중 잘 되는 음악 추천해 주세요"],
    ]);
    await liveScene({ id: "seed-bc-live-4", owner: U.seoyeon, title: "예시 방송 · 기타 연습 시간", sourceType: "camera", minutesAgo: 48 }, [
      [U.seoyeon, "오늘은 쉬운 곡부터 쳐 볼게요"],
      [U.harin, "소리 좋아요"],
      [U.viewer, "어떤 곡이에요?"],
      [U.seoyeon, "잔잔한 곡이에요"],
    ]);
    log("방송 중 예시 방송 4개");

    // 신고와 제재. 운영 처리는 시드 실행자(테스트 운영자 계정)로 한다.
    const runner = seedRunner();
    await mod.report(await viewerOf(V), { targetType: "chat", targetId: "seed-bc-harin-c3", broadcastId: "seed-bc-harin", reason: "abuse", detail: "" });
    await admin.resolve(runner, U.jiwoo, { action: "dismiss", reason: "위반이 확인되지 않아 기각했어요" });
    for (const r of PRACTICE_REPORTS) await createPracticeReport(r);
    await admin.sanction(runner, U.minsu, { kind: "warning", reason: "방송 중 부적절한 표현을 써서 경고해요" });
    const warning = (await db().collection("sanctions").where("userId", "==", U.minsu).get()).docs[0]!;
    await appealUseCases.create(await viewerOf(U.minsu), warning.id, "농담으로 한 말이었어요. 앞으로 조심할 테니 경고를 풀어 주세요.");
    await admin.sanction(runner, U.suspended, { kind: "suspend", reason: "운영정책을 여러 번 어겨 영구 정지했어요(예시)" });
    await mod.banChat(await viewerOf(U.broadcaster), { userId: U.seoyeon, duration: "7d", memo: "도배가 심했어요" });

    // 테스트 방송자 알림 6건 가운데 최근 3건만 읽지 않은 채로 둔다.
    const broadcaster = await viewerOf(U.broadcaster);
    const notes = notificationUseCases();
    for (const n of (await notes.list(broadcaster)).items.slice(3)) await notes.read(broadcaster, n.id);

    await backdateCharge(practiceCharge, 10 * DAY); // 7일이 지난 충전이라 취소는 안 되고 환급 신청은 된다
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
      await build();
      await writeAdminLog(who, { action, targetType: "seed", targetId: "all", targetNickname: "테스트 계정", targetSeed: true, reason: "", before: "", after: "시드 계정 9개를 처음부터 다시 만들었어요" });
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
      await releaseRealSanctions([U.broadcaster, U.viewer, U.harin, U.minsu, U.jiwoo, U.seoyeon]);
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
