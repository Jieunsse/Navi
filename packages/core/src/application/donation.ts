import { findBannedWord } from "@nabi/shared";
import { getBannedWords } from "./bannedWords.ts";
import { ANONYMOUS_NAME, cheerAmount } from "@nabi/shared/honey.ts";
import type { Transaction } from "firebase-admin/firestore";
import { db, FieldValue, Timestamp } from "../adapters/firebase.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { chatBlock } from "../domain/moderation.ts";
import { donationReceived } from "../domain/notification.ts";
import { allocateFifo, streamerEarning, sharePercent, type ChargeUsage, type FifoCharge } from "../domain/honey.ts";
import { AppError, badRequest, conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { readPromotion, writePromotion, type Promotion } from "./grade.ts";
import { chatBlockError } from "./moderation.ts";
import { writeNotification } from "./notification.ts";

/** kind가 mission이면 amount는 상금, message는 미션 내용이다. */
export type DonationReq = {
  requestId: string;
  broadcastId: string;
  amount: number;
  message: string;
  kind: "chat" | "mission";
  anonymous: boolean;
  limitMinutes?: number;
};

type BroadcastData = { ownerId: string; ownerNickname: string; title: string; status: "ready" | "live" | "ended" };
export type DonationInputs = {
  req: DonationReq;
  donorUid: string;
  donor: { nickname: string; grade: string };
  existing: { donorId: string } | null;
  broadcast: BroadcastData | null;
  ownerGrade: string;
  charges: FifoCharge[];
  bannedWords: readonly string[]; // 금칙어 목록은 트랜잭션 밖에서 1분 기억한 값을 쓴다(4-7)
  /** 채팅 금지나 방송자의 활동 제한이면 이유. 후원 자체는 할 수 있고 메시지만 막는다(4-14, 4-15). */
  chatBlock: ReturnType<typeof chatBlock>;
  /** 후원자와 방송자의 본인인증 명의가 같다. 같으면 받은 후원 건수에 세지 않는다(4-12, 06 결정 29). */
  sameIdentity: boolean;
  /** 채팅 후원 확정으로 방송자가 승급하면 그 내용. 읽기 단계에서 정해 둔다. */
  promotion: Promotion | null;
};

/** 방송 채팅 모음에 넣고 LiveKit으로 보내는 후원 항목(4-8). 채팅 화면이 이 필드로 그린다. */
export type DonationEntry = {
  authorId: string | null; // 익명 후원이면 비운다(결정 27, 28)
  authorNickname: string; // 익명 후원이면 "익명"
  authorGrade: string | null;
  isHost: false | null;
  content: string;
  hidden: boolean;
  messageId: string;
  createdAt: string;
  kind: "donation" | "mission";
  amount: number;
  missionContent?: string;
  missionStatus?: string;
  deadlineAt?: string | null;
};

export const walletRef = (uid: string) => db().collection("wallets").doc(uid);

export type WalletDelta = { balance?: number; pendingMission?: number; pendingRefund?: number };

/** 지갑 값을 더하고 뺀다. 지갑이 처음이면 나머지 칸도 함께 만든다. */
export function bumpWallet(tx: Transaction, uid: string, exists: boolean, d: WalletDelta) {
  const now = Timestamp.now();
  if (exists) {
    const inc = (n?: number) => (n ? FieldValue.increment(n) : undefined);
    const patch = { balance: inc(d.balance), pendingMission: inc(d.pendingMission), pendingRefund: inc(d.pendingRefund) };
    tx.update(walletRef(uid), { ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), updatedAt: now });
  } else tx.create(walletRef(uid), { balance: d.balance ?? 0, pendingMission: d.pendingMission ?? 0, pendingRefund: d.pendingRefund ?? 0, updatedAt: now });
}

/** 후원을 쓸 때 지갑에서 바뀌는 값: 채팅은 잔액만, 미션은 잔액을 빼서 묶는다(4-8의 꿀 내역 규칙). */
export const walletDeltaFor = (req: DonationReq): WalletDelta => (req.kind === "mission" ? { balance: -req.amount, pendingMission: req.amount } : { balance: -req.amount });

/** 두 사용자의 본인인증 명의 확인값이 같은가. 한쪽이라도 인증하지 않았으면 같지 않다. 읽기 단계에서 부른다. */
export async function isSameIdentity(tx: Transaction, a: string, b: string) {
  if (a === b) return true;
  const [x, y] = await Promise.all([a, b].map((u) => tx.get(db().collection("identityVerifications").doc(u))));
  const hash = x.data()?.identityHash as string | undefined;
  return !!hash && hash === y.data()?.identityHash;
}

/** 읽기 단계. Firestore 트랜잭션은 읽기를 모두 끝낸 뒤에 써야 한다. */
export async function readDonationInputs(tx: Transaction, donorUid: string, req: DonationReq): Promise<DonationInputs> {
  const fs = db();
  const [existing, bSnap, donorSnap, chargeSnap] = await Promise.all([
    tx.get(fs.collection("donations").doc(req.requestId)),
    tx.get(fs.collection("broadcasts").doc(req.broadcastId)),
    tx.get(fs.collection("users").doc(donorUid)),
    tx.get(fs.collection("charges").where("userId", "==", donorUid).where("status", "==", "done").orderBy("approvedAt")),
  ]);
  const broadcast = (bSnap.data() as BroadcastData | undefined) ?? null;
  const ownerGrade = broadcast ? ((await tx.get(fs.collection("users").doc(broadcast.ownerId))).data()?.grade as string | undefined) ?? "egg" : "egg";
  const d = donorSnap.data() as { nickname: string; grade: string; suspended?: boolean; chatBannedUntil?: Timestamp | null } | undefined;
  const ownerBan = broadcast && broadcast.ownerId !== donorUid ? await tx.get(fs.collection("users").doc(broadcast.ownerId).collection("chatBans").doc(donorUid)) : null;
  const banEnd = (ownerBan?.data() as { endAt: Timestamp | null } | undefined)?.endAt;
  const sameIdentity = broadcast ? await isSameIdentity(tx, donorUid, broadcast.ownerId) : false;
  const promotion = broadcast && req.kind === "chat" ? await readPromotion(tx, broadcast.ownerId, { donationCount: sameIdentity ? 0 : 1 }) : null;
  return {
    req,
    donorUid,
    sameIdentity,
    promotion,
    donor: { nickname: d?.nickname ?? "", grade: d?.grade ?? "egg" },
    existing: (existing.data() as { donorId: string } | undefined) ?? null,
    broadcast,
    ownerGrade,
    chatBlock: chatBlock({ suspended: d?.suspended, chatBannedUntil: d?.chatBannedUntil?.toDate() }, ownerBan?.exists ? { endAt: banEnd?.toDate() ?? null } : null, new Date()),
    charges: chargeSnap.docs.map((c) => ({ id: c.id, remaining: c.data().remaining as number, approvedAtMs: (c.data().approvedAt as Timestamp).toMillis() })),
    bannedWords: await getBannedWords(),
  };
}

const insufficient = () => conflict("INSUFFICIENT", "꿀이 모자라요. 잔액을 다시 확인해 주세요");

/** 후원할 수 있는지 확인하고, 쓸 충전 건을 정한다. 쓰지 않고 결과만 돌려준다. extra는 이 트랜잭션에서 막 확정한 충전 건. */
export function planDonation(inp: DonationInputs, balance: number, extra?: FifoCharge): { error: AppError } | { usage: ChargeUsage[] } {
  const b = inp.broadcast;
  if (!b) return { error: notFound() };
  if (inp.req.message.trim() && inp.chatBlock) return { error: chatBlockError(inp.chatBlock) };
  if (b.ownerId === inp.donorUid) return { error: forbidden("내 방송에는 후원할 수 없어요") };
  if (b.status === "ended") return { error: conflict("BROADCAST_ENDED", "끝난 방송에는 후원할 수 없어요") };
  // 미션은 방송 중에만 받는다. 준비 상태 방송은 시작하지 않은 채 남을 수 있어 묶인 꿀을 정리할 길이 없다(결정 25).
  if (inp.req.kind === "mission" && b.status !== "live") return { error: conflict("MISSION_NOT_LIVE", "방송이 시작되면 미션을 보낼 수 있어요") };
  if (balance < inp.req.amount) return { error: insufficient() };
  const usage = allocateFifo(extra ? [...inp.charges, extra] : inp.charges, inp.req.amount);
  return usage ? { usage } : { error: insufficient() };
}

/**
 * 쓰기 단계. 후원 기록, 방송 채팅 항목, 꿀 내역, 충전 건별 남은 꿀, 방송·방송자 합계를 함께 바꾼다.
 * 지갑 잔액은 부른 쪽이 바꾼다. newChargeId는 같은 트랜잭션에서 만든 충전 건이라 부른 쪽이 직접 쓴다.
 */
export function writeDonation(tx: Transaction, inp: DonationInputs, usage: ChargeUsage[], newChargeId?: string): DonationEntry {
  const fs = db();
  const { req, donorUid, donor } = inp;
  const b = inp.broadcast!;
  const now = Timestamp.now();
  const mission = req.kind === "mission";
  const banned = mission ? null : findBannedWord(req.message, inp.bannedWords); // 미션 내용의 금칙어는 만들기 전에 거절한다
  const base = {
    kind: req.kind,
    donorId: donorUid, // 익명이어도 실제 후원자를 기록한다(4-8)
    donorNickname: donor.nickname,
    anonymous: req.anonymous,
    broadcastId: req.broadcastId,
    broadcastTitle: b.title,
    streamerId: b.ownerId,
    streamerNickname: b.ownerNickname,
    amount: req.amount,
    message: req.message,
    chargeUsage: usage,
    sameIdentity: inp.sameIdentity, // 정산 보류 확인과 승급 건수에서 뺀다(4-12)
    settlementId: null, // 정산 전에는 null(필드가 없으면 색인에서 찾지 못한다, 결정 27)
    createdAt: now,
  };
  if (mission) {
    // 확정 시각, 등급, 배분 비율은 전달된 꿀이 생길 때(성공·실패) 넣는다.
    tx.create(fs.collection("donations").doc(req.requestId), {
      ...base,
      messageHidden: false,
      missionStatus: "pending",
      missionLimitMin: req.limitMinutes,
      cheer: cheerAmount(req.amount),
      delivered: 0,
      streamerEarning: 0,
      acceptedAt: null,
      deadlineAt: null,
    });
  } else {
    tx.create(fs.collection("donations").doc(req.requestId), {
      ...base,
      messageHidden: !!banned,
      delivered: req.amount,
      streamerGrade: inp.ownerGrade, // 확정할 때의 등급과 비율을 남긴다(4-12)
      shareRate: sharePercent(inp.ownerGrade) / 100,
      streamerEarning: streamerEarning(req.amount, inp.ownerGrade),
      confirmedAt: now,
    });
  }
  if (banned) tx.create(fs.collection("hiddenComments").doc(req.requestId), { broadcastId: req.broadcastId, content: req.message, word: banned, createdAt: now });

  const anon = req.anonymous;
  const entry: DonationEntry = {
    authorId: anon ? null : donorUid,
    authorNickname: anon ? ANONYMOUS_NAME : donor.nickname,
    authorGrade: anon ? null : donor.grade,
    isHost: anon ? null : false,
    content: mission || banned ? "" : req.message,
    hidden: !!banned,
    messageId: req.requestId,
    createdAt: now.toDate().toISOString(),
    kind: mission ? "mission" : "donation",
    amount: req.amount,
    ...(mission && { missionContent: req.message, missionStatus: "pending", deadlineAt: null }),
  };
  tx.create(fs.collection("broadcasts").doc(req.broadcastId).collection("comments").doc(req.requestId), { ...entry, createdAt: now });
  if (!mission) {
    tx.update(fs.collection("broadcasts").doc(req.broadcastId), { donationTotal: FieldValue.increment(req.amount), donationCount: FieldValue.increment(1) });
    if (!inp.sameIdentity) tx.update(fs.collection("users").doc(b.ownerId), { donationReceivedCount: FieldValue.increment(1) });
    writePromotion(tx, inp.promotion);
    writeNotification(tx, b.ownerId, donationReceived(donor.nickname, anon, req.amount, req.requestId));
  }
  tx.create(fs.collection("honeyLedger").doc(), { userId: donorUid, type: mission ? "missionHold" : "donation", amount: -req.amount, donationId: req.requestId, createdAt: now });
  for (const u of usage) if (u.chargeId !== newChargeId) tx.update(fs.collection("charges").doc(u.chargeId), { remaining: FieldValue.increment(-u.amount) });
  return entry;
}

export function donationUseCases(livekit: LiveKitPort) {
  /** 채팅 후원과 미션 후원이 같은 순서로 처리한다. 후원 요청 번호로 한 번만 처리한다(4-8). */
  async function run(viewer: Viewer, req: DonationReq) {
    const out = await db().runTransaction(async (tx) => {
      const inp = await readDonationInputs(tx, viewer.uid, req);
      const wallet = await tx.get(walletRef(viewer.uid));
      const balance = (wallet.data()?.balance as number | undefined) ?? 0;
      if (inp.existing) {
        if (inp.existing.donorId !== viewer.uid) throw conflict("DUPLICATE_REQUEST", "이미 쓰고 있는 요청 번호예요");
        return { entry: null, balance }; // 같은 요청이 다시 왔다. 처리한 결과만 돌려준다.
      }
      const plan = planDonation(inp, balance);
      if ("error" in plan) throw plan.error;
      bumpWallet(tx, viewer.uid, wallet.exists, walletDeltaFor(req));
      return { entry: writeDonation(tx, inp, plan.usage), balance: balance - req.amount };
    });
    if (out.entry) await livekit.send(req.broadcastId, req.kind === "mission" ? "mission" : "donation", out.entry);
    return { ok: true as const, balance: out.balance };
  }

  return {
    donate: (viewer: Viewer, broadcastId: string, input: { requestId: string; amount: number; message: string; anonymous: boolean }) =>
      run(viewer, { ...input, broadcastId, kind: "chat" }),

    /** 미션 후원. 내용에 금칙어가 있으면 만들지 않는다(4-8). */
    async donateMission(viewer: Viewer, broadcastId: string, input: { requestId: string; amount: number; content: string; limitMinutes: number; anonymous: boolean }) {
      assertMissionContent(input.content, await getBannedWords());
      return run(viewer, { requestId: input.requestId, amount: input.amount, message: input.content, anonymous: input.anonymous, limitMinutes: input.limitMinutes, broadcastId, kind: "mission" });
    },
  };
}

export function assertMissionContent(content: string, words: readonly string[]) {
  if (findBannedWord(content, words)) throw badRequest("MISSION_BANNED", "미션 내용에 쓸 수 없는 말이 들어 있어요");
}
