import { chatItemSchema, type ChatItem } from "@nabi/shared/chat.ts";
import { ANONYMOUS_NAME, cheerAmount, type MissionCard, type MissionStatus } from "@nabi/shared/honey.ts";
import type { DocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { db, FieldValue, iso, Timestamp } from "../adapters/firebase.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { sharePercent, streamerEarning, type ChargeUsage } from "../domain/honey.ts";
import { endOfBroadcast, isPastDeadline, missionMoney, restoreLifo, successOrLate, type MissionEnd } from "../domain/mission.ts";
import { missionDelivered, missionResult } from "../domain/notification.ts";
import { conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { walletRef } from "./donation.ts";
import { readPromotion, writePromotion } from "./grade.ts";
import { writeNotification } from "./notification.ts";

type MissionDoc = {
  donorId: string;
  donorNickname: string;
  anonymous: boolean;
  broadcastId: string;
  streamerId: string;
  streamerNickname?: string;
  sameIdentity?: boolean; // 후원자와 방송자 명의가 같으면 받은 후원 건수에 세지 않는다(4-12)
  amount: number;
  cheer?: number;
  message: string;
  missionStatus: MissionStatus;
  missionLimitMin: number;
  deadlineAt: Timestamp | null;
  chargeUsage: ChargeUsage[];
  createdAt: Timestamp;
  kind: string;
};

/** 한 미션을 바꾸는 데 필요한 읽기 결과. Firestore 트랜잭션은 읽기를 모두 끝낸 뒤에 써야 한다. */
type Ctx = { id: string; snap: DocumentSnapshot; m: MissionDoc; comment: Record<string, unknown>; ownerGrade: string; broadcastExists: boolean };

const donations = () => db().collection("donations");
const commentRef = (broadcastId: string, id: string) => db().collection("broadcasts").doc(broadcastId).collection("comments").doc(id);

async function readCtx(tx: Transaction, snap: DocumentSnapshot, ownerGrade: string, broadcastExists: boolean): Promise<Ctx> {
  const m = snap.data() as MissionDoc;
  const comment = (await tx.get(commentRef(m.broadcastId, snap.id))).data() ?? {};
  return { id: snap.id, snap, m, comment, ownerGrade, broadcastExists };
}

/** 이 끝맺음이 방송자의 받은 후원 건수를 하나 늘리는가(4-12). 같은 명의는 세지 않는다. */
const promotionCount = (c: Ctx, end: MissionEnd) => (missionMoney(end, c.m.amount).delivered > 0 && c.broadcastExists && !c.m.sameIdentity ? 1 : 0);

/** 채팅 항목(댓글 문서)을 LiveKit으로 보낼 모양으로 바꾼다. 익명이면 후원자 정보가 이미 비어 있다. */
function toItem(c: Record<string, unknown>, patch: { missionStatus: MissionStatus; deadlineAt: Timestamp | null }): ChatItem {
  return chatItemSchema.parse({ ...c, kind: "mission", missionStatus: patch.missionStatus, deadlineAt: iso(patch.deadlineAt), createdAt: iso(c.createdAt as Timestamp) });
}

/** 수락: 대기 중 → 진행 중. 제한 시간은 수락한 때부터 잰다. */
function writeAccept(tx: Transaction, c: Ctx, now: Timestamp) {
  const deadlineAt = Timestamp.fromMillis(now.toMillis() + c.m.missionLimitMin * 60_000);
  tx.update(c.snap.ref, { missionStatus: "active", acceptedAt: now, deadlineAt });
  tx.update(commentRef(c.m.broadcastId, c.id), { missionStatus: "active", deadlineAt });
  return toItem(c.comment, { missionStatus: "active", deadlineAt });
}

/**
 * 끝맺음: 거절·취소(전부 돌려줌), 성공(상금 전부 전달), 실패(응원금만 전달, 나머지 돌려줌).
 * 미션 문서, 채팅 항목, 지갑, 꿀 내역, 충전 건, (전달된 꿀이 있으면) 방송 합계를 같은 트랜잭션에서 바꾼다(4-8).
 */
function writeEnd(tx: Transaction, c: Ctx, end: MissionEnd, now: Timestamp) {
  const { m } = c;
  const { delivered, returned } = missionMoney(end, m.amount);
  const fs = db();
  tx.update(c.snap.ref, {
    missionStatus: end,
    delivered,
    deadlineAt: null,
    // 확정 시각과 등급은 전달된 꿀이 있을 때만 넣는다. 거절·취소는 비워 둔다(결정 27).
    ...(delivered > 0 && {
      confirmedAt: now,
      streamerGrade: c.ownerGrade,
      shareRate: sharePercent(c.ownerGrade) / 100,
      streamerEarning: streamerEarning(delivered, c.ownerGrade),
    }),
  });
  tx.update(commentRef(m.broadcastId, c.id), { missionStatus: end, deadlineAt: null });
  tx.update(walletRef(m.donorId), { pendingMission: FieldValue.increment(-m.amount), balance: FieldValue.increment(returned), updatedAt: now });
  if (delivered > 0) tx.create(fs.collection("honeyLedger").doc(), { userId: m.donorId, type: "missionConfirm", amount: 0, delivered, donationId: c.id, createdAt: now });
  if (returned > 0) {
    tx.create(fs.collection("honeyLedger").doc(), { userId: m.donorId, type: "missionReturn", amount: returned, donationId: c.id, createdAt: now });
    for (const u of restoreLifo(m.chargeUsage, returned)) tx.update(fs.collection("charges").doc(u.chargeId), { remaining: FieldValue.increment(u.amount) });
  }
  if (delivered > 0 && c.broadcastExists) {
    // 승급 확인은 부른 쪽이 한다(읽기를 먼저 끝내야 해서).
    tx.update(fs.collection("broadcasts").doc(m.broadcastId), { donationTotal: FieldValue.increment(delivered), donationCount: FieldValue.increment(1) });
    if (!m.sameIdentity) tx.update(fs.collection("users").doc(m.streamerId), { donationReceivedCount: FieldValue.increment(1) });
  }
  if (delivered > 0) writeNotification(tx, m.streamerId, missionDelivered(m.donorNickname, m.anonymous, delivered, end === "success", c.id));
  writeNotification(tx, m.donorId, missionResult(m.streamerNickname ?? "방송자", end, c.id));
  return toItem(c.comment, { missionStatus: end, deadlineAt: null });
}

/** 한 미션을 끝맺고 승급을 확인한다. 아직 아무것도 쓰지 않았을 때만 부른다. */
async function finishOne(tx: Transaction, c: Ctx, end: MissionEnd, now: Timestamp) {
  const promo = await readPromotion(tx, c.m.streamerId, { donationCount: promotionCount(c, end) });
  const item = writeEnd(tx, c, end, now);
  writePromotion(tx, promo);
  return item;
}

const ownerGradeOf = async (tx: Transaction, ownerId: string) => ((await tx.get(db().collection("users").doc(ownerId))).data()?.grade as string | undefined) ?? "egg";

/** 방송 종료 함수가 쓴다. 대기 중은 취소, 진행 중은 실패로 정리한다(07 3장). 한 번에 limit개까지 처리하고 나머지는 다음 번에 한다. */
export async function planMissionCleanup(tx: Transaction, broadcastId: string, ownerId: string, limit = 20) {
  const snap = await tx.get(
    donations().where("broadcastId", "==", broadcastId).where("kind", "==", "mission").where("missionStatus", "in", ["pending", "active"]).limit(limit),
  );
  const ownerGrade = snap.empty ? "egg" : await ownerGradeOf(tx, ownerId);
  const ctxs = await Promise.all(snap.docs.map((d) => readCtx(tx, d, ownerGrade, true)));
  const ends = ctxs.map((c) => endOfBroadcast(c.m.missionStatus)!);
  return {
    count: ctxs.length,
    /** 이 정리로 방송자의 받은 후원 건수가 늘어나는 수. 부른 쪽이 승급을 읽을 때 더한다. */
    donationCount: ctxs.reduce((n, c, i) => n + promotionCount(c, ends[i]), 0),
    /** 읽기를 모두 끝낸 뒤에 부른다. LiveKit으로 보낼 항목을 돌려준다. */
    apply(): ChatItem[] {
      const now = Timestamp.now();
      return ctxs.map((c, i) => writeEnd(tx, c, ends[i], now));
    },
  };
}

/** 한 트랜잭션에 다 못 담은 미션이 남았으면 남은 것도 정리한다. 방송은 이미 끝난 뒤다. */
export async function cleanupRemainingMissions(broadcastId: string, ownerId: string, livekit: LiveKitPort) {
  for (;;) {
    const items = await db().runTransaction(async (tx) => {
      const plan = await planMissionCleanup(tx, broadcastId, ownerId);
      const promo = await readPromotion(tx, ownerId, { donationCount: plan.donationCount });
      const out = plan.apply();
      writePromotion(tx, promo);
      return out;
    });
    for (const i of items) await livekit.send(broadcastId, "mission", i);
    if (items.length === 0) return;
  }
}

export function missionUseCases(livekit: LiveKitPort) {
  /** 방송자의 수락·거절·성공·실패와 누구나의 마감 처리 요청. 트랜잭션 안에서 방송과 미션 상태를 다시 확인한다(4-8). */
  async function act(viewer: Viewer | null, broadcastId: string, missionId: string, action: "accept" | "reject" | "success" | "fail" | "expire") {
    const out = await db().runTransaction(async (tx) => {
      const snap = await tx.get(donations().doc(missionId));
      const m = snap.data() as MissionDoc | undefined;
      if (!m || m.kind !== "mission" || m.broadcastId !== broadcastId) throw notFound("미션을 찾을 수 없어요");
      const bSnap = await tx.get(db().collection("broadcasts").doc(broadcastId));
      const status = (bSnap.data() as { status?: string } | undefined)?.status;
      const ownerGrade = await ownerGradeOf(tx, m.streamerId);
      const ctx = await readCtx(tx, snap, ownerGrade, bSnap.exists);
      const now = Timestamp.now();
      const state = (): { status: MissionStatus; item: null } => ({ status: m.missionStatus, item: null });

      if (action === "expire") {
        // 누구나 부를 수 있다. 마감이 정말 지났을 때만 실패로 바꾼다.
        if (m.missionStatus !== "active" || !isPastDeadline(m.deadlineAt?.toMillis() ?? null, now.toMillis())) return state();
        return { status: "failed" as const, item: await finishOne(tx, ctx, "failed", now) };
      }

      if (!viewer || viewer.uid !== m.streamerId) throw forbidden("내 방송의 미션만 처리할 수 있어요");
      if (status !== "live") throw conflict("BROADCAST_ENDED", "방송이 끝나서 미션을 처리할 수 없어요");
      const needed: MissionStatus = action === "accept" || action === "reject" ? "pending" : "active";
      if (m.missionStatus !== needed) throw conflict("MISSION_STATE", "이미 처리된 미션이에요");

      if (action === "accept") return { status: "active" as const, item: writeAccept(tx, ctx, now) };
      // 마감이 지난 뒤의 "성공"은 실패로 처리한다(결정 27)
      const end: MissionEnd = action === "reject" ? "rejected" : action === "fail" ? "failed" : successOrLate(m.deadlineAt?.toMillis() ?? null, now.toMillis());
      return { status: end, item: await finishOne(tx, ctx, end, now) };
    });
    if (out.item) await livekit.send(broadcastId, "mission", out.item);
    return { status: out.status };
  }

  return {
    act,

    /** 송출 화면의 미션 목록. 방송자만 본다. 익명 후원자는 "익명"으로 보인다. */
    async list(viewer: Viewer, broadcastId: string): Promise<MissionCard[]> {
      const b = (await db().collection("broadcasts").doc(broadcastId).get()).data() as { ownerId: string } | undefined;
      if (!b) throw notFound();
      if (b.ownerId !== viewer.uid) throw forbidden();
      const snap = await donations().where("broadcastId", "==", broadcastId).where("kind", "==", "mission").get();
      return snap.docs
        .map((d) => ({ id: d.id, m: d.data() as MissionDoc }))
        .sort((a, b) => a.m.createdAt.toMillis() - b.m.createdAt.toMillis())
        .map(({ id, m }) => ({
          id,
          content: m.message,
          amount: m.amount,
          cheer: m.cheer ?? cheerAmount(m.amount),
          status: m.missionStatus,
          donor: m.anonymous ? ANONYMOUS_NAME : m.donorNickname,
          limitMinutes: m.missionLimitMin,
          deadlineAt: iso(m.deadlineAt),
          createdAt: iso(m.createdAt)!,
        }));
    },
  };
}
