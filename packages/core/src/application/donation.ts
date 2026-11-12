import { findBannedWord } from "@nabi/shared";
import type { Transaction } from "firebase-admin/firestore";
import { db, FieldValue, Timestamp } from "../adapters/firebase.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { chatBlock } from "../domain/moderation.ts";
import { allocateFifo, streamerEarning, sharePercent, type ChargeUsage, type FifoCharge } from "../domain/honey.ts";
import { AppError, conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { chatBlockError } from "./moderation.ts";

export type DonationReq = { requestId: string; broadcastId: string; amount: number; message: string };

type BroadcastData = { ownerId: string; ownerNickname: string; title: string; status: "ready" | "live" | "ended" };
export type DonationInputs = {
  req: DonationReq;
  donorUid: string;
  donor: { nickname: string; grade: string };
  existing: { donorId: string } | null;
  broadcast: BroadcastData | null;
  ownerGrade: string;
  charges: FifoCharge[];
  /** 채팅 금지나 방송자의 활동 제한이면 이유. 후원 자체는 할 수 있고 메시지만 막는다(4-14, 4-15). */
  chatBlock: ReturnType<typeof chatBlock>;
};

/** 방송 채팅 모음에 넣고 LiveKit으로 보내는 후원 항목(4-8). 채팅 화면이 이 필드로 그린다. */
export type DonationEntry = {
  authorId: string;
  authorNickname: string;
  authorGrade: string;
  isHost: false;
  content: string;
  hidden: boolean;
  messageId: string;
  createdAt: string;
  kind: "donation";
  amount: number;
};

export const walletRef = (uid: string) => db().collection("wallets").doc(uid);

/** 지갑 잔액을 바꾼다. 지갑이 처음이면 나머지 칸도 함께 만든다. */
export function bumpWallet(tx: Transaction, uid: string, exists: boolean, delta: number) {
  const now = Timestamp.now();
  if (exists) tx.update(walletRef(uid), { balance: FieldValue.increment(delta), updatedAt: now });
  else tx.create(walletRef(uid), { balance: delta, pendingMission: 0, pendingRefund: 0, updatedAt: now });
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
  return {
    req,
    donorUid,
    donor: { nickname: d?.nickname ?? "", grade: d?.grade ?? "egg" },
    existing: (existing.data() as { donorId: string } | undefined) ?? null,
    broadcast,
    ownerGrade,
    chatBlock: chatBlock({ suspended: d?.suspended, chatBannedUntil: d?.chatBannedUntil?.toDate() }, ownerBan?.exists ? { endAt: banEnd?.toDate() ?? null } : null, new Date()),
    charges: chargeSnap.docs.map((c) => ({ id: c.id, remaining: c.data().remaining as number, approvedAtMs: (c.data().approvedAt as Timestamp).toMillis() })),
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
  const banned = findBannedWord(req.message);
  const earning = streamerEarning(req.amount, inp.ownerGrade);

  tx.create(fs.collection("donations").doc(req.requestId), {
    kind: "chat",
    donorId: donorUid,
    donorNickname: donor.nickname,
    anonymous: false,
    broadcastId: req.broadcastId,
    broadcastTitle: b.title,
    streamerId: b.ownerId,
    streamerNickname: b.ownerNickname,
    amount: req.amount,
    delivered: req.amount,
    message: req.message,
    messageHidden: !!banned,
    chargeUsage: usage,
    streamerGrade: inp.ownerGrade, // 확정할 때의 등급과 비율을 남긴다(4-12)
    shareRate: sharePercent(inp.ownerGrade) / 100,
    streamerEarning: earning,
    settlementId: null,
    createdAt: now,
    confirmedAt: now,
  });
  if (banned) tx.create(fs.collection("hiddenComments").doc(req.requestId), { broadcastId: req.broadcastId, content: req.message, word: banned, createdAt: now });

  const entry: DonationEntry = {
    authorId: donorUid,
    authorNickname: donor.nickname,
    authorGrade: donor.grade,
    isHost: false,
    content: banned ? "" : req.message,
    hidden: !!banned,
    messageId: req.requestId,
    createdAt: now.toDate().toISOString(),
    kind: "donation",
    amount: req.amount,
  };
  tx.create(fs.collection("broadcasts").doc(req.broadcastId).collection("comments").doc(req.requestId), { ...entry, createdAt: now });
  tx.update(fs.collection("broadcasts").doc(req.broadcastId), { donationTotal: FieldValue.increment(req.amount), donationCount: FieldValue.increment(1) });
  tx.update(fs.collection("users").doc(b.ownerId), { donationReceivedCount: FieldValue.increment(1) });
  tx.create(fs.collection("honeyLedger").doc(), { userId: donorUid, type: "donation", amount: -req.amount, donationId: req.requestId, createdAt: now });
  for (const u of usage) if (u.chargeId !== newChargeId) tx.update(fs.collection("charges").doc(u.chargeId), { remaining: FieldValue.increment(-u.amount) });
  return entry;
}

export function donationUseCases(livekit: LiveKitPort) {
  return {
    /** 채팅 후원. 후원 요청 번호로 한 번만 처리한다(4-8). */
    async donate(viewer: Viewer, broadcastId: string, input: { requestId: string; amount: number; message: string }) {
      const req: DonationReq = { ...input, broadcastId };
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
        bumpWallet(tx, viewer.uid, wallet.exists, -req.amount);
        return { entry: writeDonation(tx, inp, plan.usage), balance: balance - req.amount };
      });
      if (out.entry) await livekit.send(broadcastId, "donation", out.entry);
      return { ok: true as const, balance: out.balance };
    },
  };
}
