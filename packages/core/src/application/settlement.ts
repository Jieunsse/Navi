import { timingSafeEqual } from "node:crypto";
import { MASKED_NICKNAME, TEST_ACCOUNT_PROTECTED_MESSAGE, TEST_ADMIN_SCOPE_MESSAGE } from "@nabi/shared/moderation.ts";
import { SETTLEMENT_CHUNK, type SettlementStatus, type TestRunResult } from "@nabi/shared/settlement.ts";
import type { Query } from "firebase-admin/firestore";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import type { TransferPort } from "../adapters/transfer.ts";
import { inTestAdminScope, sanctionRefusal } from "../domain/moderation.ts";
import { sharePercent } from "../domain/honey.ts";
import {
  chunk,
  COLLECTABLE,
  followingPayoutDate,
  kstMonthStart,
  nearestPayoutDate,
  payoutMonthStart,
  payoutPeriod,
  scheduledPayoutDate,
  scheduledSettlementId,
  summarize,
  testRunMessage,
  testSettlementId,
  UNPAID,
} from "../domain/settlement.ts";
import { settlementHeld, settlementPaid } from "../domain/notification.ts";
import { conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { notify, writeNotification } from "./notification.ts";

const settlementsCol = () => db().collection("settlements");
const donationsCol = () => db().collection("donations");
const usersCol = () => db().collection("users");
const jobRuns = () => db().collection("jobRuns");
const JOB_NAME = "monthlySettlement";

type DonationDoc = { delivered?: number; streamerEarning?: number; abandoned?: boolean; sameIdentity?: boolean };
type SettlementDoc = {
  streamerId: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  mode: "scheduled" | "test";
  donationCount: number;
  honey: number;
  streamerShare: number;
  nabiShare: number;
  deduction: number;
  tax: number;
  payout: number;
  status: SettlementStatus;
  holdReason: string | null;
  heldBy: string | null;
  payoutDate: Timestamp;
  paidAt: Timestamp | null;
  transferId: string | null;
  mock: boolean;
  hasSameIdentity: boolean;
  createdAt: Timestamp;
};
type AccountDoc = { bank: string; last4: string; holder: string; test: boolean };

// shortcut: 포기한 후원(탈퇴 포기)이 한 번에 490건 넘게 쌓이면 그 뒤 후원이 정산에서 밀린다. 탈퇴 정산을 만들 때 색인을 더한다.
const countable = (d: DonationDoc) => !d.abandoned && (d.delivered ?? 0) > 0;
const rowOf = (d: DonationDoc) => ({ delivered: d.delivered ?? 0, earning: d.streamerEarning ?? 0 });

/** 아직 정산 ID가 없고 [from, to)에 확정된 후원. from이 null이면 처음부터다. */
function unsettled(uid: string, from: Date | null, to: Date): Query {
  let q = donationsCol().where("streamerId", "==", uid).where("settlementId", "==", null).where("confirmedAt", "<", Timestamp.fromDate(to));
  if (from) q = q.where("confirmedAt", ">=", Timestamp.fromDate(from));
  return q.orderBy("confirmedAt");
}

/** 정산 계산(4-12). 저장하지 않고 합계만 돌려준다. 내 방송 관리의 정산 카드도 이 함수로 구한다. */
export async function calculateSettlement(uid: string, from: Date | null, to: Date) {
  const snap = await unsettled(uid, from, to).get();
  return summarize(snap.docs.map((d) => d.data() as DonationDoc).filter(countable).map(rowOf));
}

/** 받지 못한 수익 배분금(4-11): 지급 대기·보류·지급 실패 기록의 지급액과, 아직 정산하지 않은 확정 후원의 방송자 몫. 다음 지급일과 함께 돌려준다. */
export async function unpaidEarnings(uid: string, now: Date) {
  const [open, rest] = await Promise.all([settlementsCol().where("streamerId", "==", uid).where("status", "in", [...UNPAID]).get(), calculateSettlement(uid, null, now)]);
  return { amount: open.docs.reduce((s, d) => s + (d.data() as SettlementDoc).payout, 0) + rest.streamerShare, payoutDate: nearestPayoutDate(now) };
}

/** 송금 중인 정산 기록이 있는가. 결과가 나오기 전에는 포기로 바꾸지 않는다. */
export async function hasSendingSettlement(uid: string) {
  return !(await settlementsCol().where("streamerId", "==", uid).where("status", "==", "sending").limit(1).get()).empty;
}

/** 탈퇴 포기(4-11): 받지 못한 정산 기록은 "포기"로, 그 기록에 든 후원과 아직 정산하지 않은 후원은 abandoned로 표시한다. */
export async function abandonEarnings(uid: string) {
  const w = db().bulkWriter();
  const open = await settlementsCol().where("streamerId", "==", uid).where("status", "in", [...UNPAID]).get();
  for (const s of open.docs) {
    void w.update(s.ref, { status: "abandoned" satisfies SettlementStatus });
    for (const d of (await donationsCol().where("settlementId", "==", s.id).get()).docs) void w.update(d.ref, { abandoned: true });
  }
  for (const d of (await donationsCol().where("streamerId", "==", uid).where("settlementId", "==", null).get()).docs) void w.update(d.ref, { abandoned: true });
  await w.close();
}

type Plan = {
  mode: "scheduled" | "test";
  from: Date | null;
  to: Date;
  periodStart: Date;
  periodEnd: Date;
  payoutDate: Date;
  idOf: (uid: string, seq: number) => string;
};

/** 방송자의 "지급 대기"·"보류(정산 정보 없음)" 기록을 "보류(운영 조치)"로 바꾼다. 바꾼 개수를 돌려준다(4-12). */
export async function holdOpenSettlements(uid: string, reason: string, heldBy: string) {
  const open = await settlementsCol().where("streamerId", "==", uid).where("status", "in", ["pending", "heldNoAccount"]).get();
  for (const part of chunk(open.docs, 400)) {
    const batch = db().batch();
    part.forEach((d) => batch.update(d.ref, { status: "heldAdmin" satisfies SettlementStatus, holdReason: reason, heldBy }));
    await batch.commit();
  }
  return open.size;
}

export function settlementUseCases(transfer: TransferPort) {
  /** 정산 확정 한 덩어리(4-12). 같은 ID가 있으면 아무것도 하지 않는다. */
  async function confirmChunk(uid: string, id: string, plan: Plan) {
    return db().runTransaction(async (tx) => {
      const ref = settlementsCol().doc(id);
      const [existing, user, snap] = await Promise.all([tx.get(ref), tx.get(usersCol().doc(uid)), tx.get(unsettled(uid, plan.from, plan.to).limit(SETTLEMENT_CHUNK))]);
      if (existing.exists) return { kind: "exists" as const };
      const docs = snap.docs.filter((d) => countable(d.data() as DonationDoc));
      if (!docs.length) return { kind: "empty" as const };
      const sum = summarize(docs.map((d) => rowOf(d.data() as DonationDoc)));
      const u = user.data() as { settlementHold?: boolean; settlementHoldReason?: string; settlementHeldBy?: string; suspended?: boolean } | undefined;
      const held = !!(u?.settlementHold || u?.suspended); // 영구 정지나 운영자 보류면 처음부터 보류다
      const doc: SettlementDoc = {
        streamerId: uid,
        periodStart: Timestamp.fromDate(plan.periodStart),
        periodEnd: Timestamp.fromDate(plan.periodEnd),
        mode: plan.mode,
        donationCount: sum.count,
        honey: sum.honey,
        streamerShare: sum.streamerShare,
        nabiShare: sum.nabiShare,
        deduction: 0,
        tax: 0,
        payout: sum.streamerShare,
        status: held ? "heldAdmin" : "pending",
        holdReason: held ? (u?.settlementHoldReason ?? "운영 조치(영구 정지)") : null,
        heldBy: held ? (u?.settlementHeldBy ?? null) : null,
        payoutDate: Timestamp.fromDate(plan.payoutDate),
        paidAt: null,
        transferId: null,
        mock: transfer.mock,
        hasSameIdentity: docs.some((d) => (d.data() as DonationDoc).sameIdentity),
        createdAt: Timestamp.now(),
      };
      tx.create(ref, doc);
      if (held) writeNotification(tx, uid, settlementHeld(doc.holdReason ?? "운영 조치", id));
      for (const d of docs) tx.update(d.ref, { settlementId: id });
      return { kind: "created" as const, count: sum.count, share: sum.streamerShare };
    });
  }

  /** 한 방송자의 정산 확정. 후원이 490건을 넘으면 `_1`, `_2`처럼 나눠 만든다. 새 후원이 없어도 부를 수 있다. */
  async function settleStreamer(uid: string, plan: Plan) {
    let count = 0;
    let share = 0;
    for (let seq = 1; ; seq++) {
      const r = await confirmChunk(uid, plan.idOf(uid, seq), plan);
      if (r.kind === "empty") break;
      if (r.kind === "created") {
        count += r.count;
        share += r.share;
      }
    }
    return { count, share };
  }

  async function updateAll(refs: FirebaseFirestore.DocumentReference[], data: Record<string, unknown>) {
    for (const part of chunk(refs, 400)) {
      const batch = db().batch();
      part.forEach((r) => batch.update(r, data));
      await batch.commit();
    }
  }

  /**
   * 지급 시도(4-12). 계좌가 없으면 "지급 대기"를 "보류(정산 정보 없음)"로 바꾼다.
   * 있으면 모아 둔 기록을 두 단계로 보낸다. 먼저 모두 "송금 중"으로 바꾸고, 그다음 기록마다 송금한다.
   */
  async function payOut(uid: string) {
    const account = (await db().collection("payoutAccounts").doc(uid).get()).data() as AccountDoc | undefined;
    if (!account) {
      const pending = await settlementsCol().where("streamerId", "==", uid).where("status", "==", "pending").get();
      await updateAll(pending.docs.map((d) => d.ref), { status: "heldNoAccount" satisfies SettlementStatus });
      if (pending.size) await notify(uid, settlementHeld("정산 정보 없음", null));
      return 0;
    }
    const found = await settlementsCol().where("streamerId", "==", uid).where("status", "in", [...COLLECTABLE]).get();
    if (!found.size) return 0;
    const claimed = await db().runTransaction(async (tx) => {
      const snaps = await tx.getAll(...found.docs.map((d) => d.ref));
      const mine: { ref: FirebaseFirestore.DocumentReference; payout: number }[] = [];
      for (const s of snaps) {
        const d = s.data() as SettlementDoc | undefined;
        if (!d || !(COLLECTABLE as readonly string[]).includes(d.status)) continue; // 다른 실행이 먼저 집었다
        tx.update(s.ref, { status: "sending" satisfies SettlementStatus });
        mine.push({ ref: s.ref, payout: d.payout });
      }
      return mine;
    });
    let paid = 0;
    for (const c of claimed) {
      try {
        const { transferId } = await transfer.send({ settlementId: c.ref.id, amount: c.payout, account });
        const batch = db().batch();
        batch.update(c.ref, { status: "paid" satisfies SettlementStatus, transferId, paidAt: Timestamp.now(), mock: transfer.mock });
        writeNotification(batch, uid, settlementPaid(c.payout, c.ref.id));
        await batch.commit();
        paid++;
      } catch {
        await c.ref.update({ status: "failed" satisfies SettlementStatus }); // 다음 실행에서 다시 시도한다
      }
    }
    return paid;
  }

  /** 처리할 방송자: 정산할 후원이 있는 사람, 그리고 보류·실패 기록이 남은 사람(4-12) */
  async function streamersToProcess(to: Date, from: Date | null) {
    const ids = new Set<string>();
    const don = await donationsCol().where("settlementId", "==", null).select("streamerId", "confirmedAt").get();
    for (const d of don.docs) {
      const at = (d.get("confirmedAt") as Timestamp | undefined)?.toDate();
      if (at && at < to && (!from || at >= from)) ids.add(d.get("streamerId") as string);
    }
    const left = await settlementsCol().where("status", "in", ["pending", "heldNoAccount", "heldAdmin", "failed"]).select("streamerId").get();
    left.docs.forEach((d) => ids.add(d.get("streamerId") as string));
    return [...ids];
  }

  async function runPlan(plan: Plan) {
    const uids = await streamersToProcess(plan.to, plan.from);
    let newDonations = 0;
    let newShare = 0;
    let paidCount = 0;
    let failedStreamers = 0;
    for (const uid of uids) {
      try {
        const s = await settleStreamer(uid, plan);
        newDonations += s.count;
        newShare += s.share;
        paidCount += await payOut(uid);
      } catch (e) {
        failedStreamers++; // 한 사람이 실패해도 나머지는 계속한다
        console.error("정산 실패", uid, e);
      }
    }
    const held = await settlementsCol().where("status", "in", ["heldNoAccount", "heldAdmin"]).count().get();
    const r = { newDonations, newShare, paidCount, heldCount: held.data().count };
    return { streamerCount: uids.length, failedStreamers, result: { ...r, message: testRunMessage(r) } satisfies TestRunResult };
  }

  async function adminLog(admin: Viewer, e: { action: string; targetType: string; targetId: string; targetNickname: string; targetSeed: boolean; reason: string; before: string; after: string }) {
    await db().collection("adminLogs").add({ adminId: admin.uid, adminNickname: admin.user.nickname, ...e, createdAt: Timestamp.now() });
  }

  async function loadUser(uid: string) {
    const snap = await usersCol().doc(uid).get();
    if (!snap.exists) throw notFound("사용자를 찾을 수 없어요");
    return snap.data() as { nickname: string; isAdmin?: boolean; seedKind?: string | null; grade?: string };
  }

  const isTest = (v: Viewer) => !!v.user.isTestAdmin;

  return {
    /** 월 정산 작업(예약 실행). 지난달 1일부터 말일까지 확정된 후원을 이번 달 25일 지급으로 정산한다. */
    async runScheduled(now = new Date()) {
      const payoutDate = scheduledPayoutDate(now);
      const period = payoutPeriod(payoutDate);
      const startedAt = Timestamp.now();
      const run = await jobRuns().add({ jobName: JOB_NAME, mode: "scheduled", adminId: null, adminNickname: null, startedAt, endedAt: null, streamerCount: 0, result: "실행 중" });
      // shortcut: 시작 아래쪽(from)은 두지 않는다. 지난 달에 실행을 놓쳐도 쌓인 후원이 이번에 함께 나간다(정산 카드 계산과 같다).
      const out = await runPlan({ mode: "scheduled", from: null, to: period.end, periodStart: period.start, periodEnd: period.end, payoutDate, idOf: (uid, seq) => scheduledSettlementId(uid, payoutDate, seq) });
      const message = out.failedStreamers ? `${out.result.message} (실패 ${out.failedStreamers}명)` : out.result.message;
      await run.update({ endedAt: Timestamp.now(), streamerCount: out.streamerCount, result: message, resultData: out.result });
      return { streamerCount: out.streamerCount, message };
    },

    /** 월 정산 지금 실행(테스트). 운영자만, 환경 변수가 켜져 있을 때만(4-12). 기간은 이번 달 1일부터 지금까지다. */
    async runTest(admin: Viewer, requestId: string, now = new Date()): Promise<TestRunResult> {
      if (process.env.ENABLE_SETTLEMENT_TEST !== "true") throw forbidden("월 정산 테스트 실행이 꺼져 있어요");
      const ref = jobRuns().doc(requestId);
      // 같은 요청 번호는 한 번만 처리한다. 같은 운영자면 저장한 결과를 돌려주고, 다른 사람이면 거절한다(06 결정 27).
      const prior = await db().runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (s.exists) return s.data() as { adminId: string; resultData?: TestRunResult };
        tx.create(ref, { jobName: JOB_NAME, mode: "test", adminId: admin.uid, adminNickname: admin.user.nickname, startedAt: Timestamp.now(), endedAt: null, streamerCount: 0, result: "실행 중" });
        return null;
      });
      if (prior) {
        if (prior.adminId !== admin.uid) throw conflict("DUPLICATE_REQUEST", "이미 쓰고 있는 요청 번호예요");
        return prior.resultData ?? { newDonations: 0, newShare: 0, paidCount: 0, heldCount: 0, message: "처리 중인 요청이에요. 잠시 뒤에 다시 확인해 주세요" };
      }
      const from = kstMonthStart(...ymOf(now));
      const out = await runPlan({ mode: "test", from, to: now, periodStart: from, periodEnd: now, payoutDate: now, idOf: (uid, seq) => testSettlementId(requestId, uid, seq) });
      await ref.update({ endedAt: Timestamp.now(), streamerCount: out.streamerCount, result: out.result.message, resultData: out.result });
      await adminLog(admin, { action: "월 정산 테스트 실행", targetType: "job", targetId: requestId, targetNickname: "월 정산", targetSeed: true, reason: "", before: "", after: out.result.message });
      return out.result;
    },

    /** 내 방송 관리 맨 위 정산 카드와 정산 내역(4-12) */
    async mine(viewer: Viewer) {
      const now = new Date();
      const nearest = nearestPayoutDate(now);
      const following = followingPayoutDate(nearest);
      const boundary = payoutMonthStart(nearest); // 이 날 전에 확정된 몫은 가까운 지급일에, 이후는 다음 지급일에 받는다
      const [a, b, open, acc, list] = await Promise.all([
        calculateSettlement(viewer.uid, null, boundary),
        calculateSettlement(viewer.uid, boundary, now),
        settlementsCol().where("streamerId", "==", viewer.uid).where("status", "in", ["pending", "heldNoAccount", "heldAdmin", "failed", "sending"]).get(),
        db().collection("payoutAccounts").doc(viewer.uid).get(),
        settlementsCol().where("streamerId", "==", viewer.uid).orderBy("createdAt", "desc").limit(50).get(),
      ]);
      const account = acc.data() as AccountDoc | undefined;
      const stacked = open.docs.reduce((s, d) => s + (d.data() as SettlementDoc).payout, 0);
      return {
        card: {
          grade: viewer.user.grade,
          sharePercent: sharePercent(viewer.user.grade),
          account: account ? { bank: account.bank, last4: account.last4, test: account.test } : null,
          nearest: { date: nearest.toISOString(), amount: a.streamerShare + stacked },
          following: { date: following.toISOString(), amount: b.streamerShare },
        },
        items: list.docs.map((d) => {
          const s = d.data() as SettlementDoc;
          return {
            id: d.id,
            periodStart: iso(s.periodStart)!,
            periodEnd: iso(s.periodEnd)!,
            mode: s.mode,
            donationCount: s.donationCount,
            streamerShare: s.streamerShare,
            status: s.status,
            holdReason: s.holdReason,
            paidAt: iso(s.paidAt),
            transferId: s.transferId,
            mock: s.mock,
            createdAt: iso(s.createdAt)!,
          };
        }),
      };
    },

    /** 운영자 정산 관리 목록(4-15). 테스트 운영자에게는 실제 사용자의 이름을 가린다. */
    async adminList(admin: Viewer) {
      const [snap, holdSnap, runSnap] = await Promise.all([
        settlementsCol().orderBy("createdAt", "desc").limit(200).get(),
        usersCol().where("settlementHold", "==", true).get(),
        jobRuns().orderBy("startedAt", "desc").limit(20).get(),
      ]);
      const holdIds = new Set(holdSnap.docs.map((d) => d.id));
      const ids = [...new Set([...snap.docs.map((d) => (d.data() as SettlementDoc).streamerId), ...holdIds])];
      const docs = ids.length ? await db().getAll(...ids.map((id) => usersCol().doc(id))) : [];
      const who = new Map(docs.map((u) => [u.id, u.data() as { nickname?: string; seedKind?: string | null; settlementHoldReason?: string } | undefined]));
      const name = (uid: string) => {
        const u = who.get(uid);
        const masked = isTest(admin) && !inTestAdminScope(u?.seedKind);
        return { masked, nickname: masked ? MASKED_NICKNAME : (u?.nickname ?? "(탈퇴한 사용자)") };
      };
      return {
        testRunEnabled: process.env.ENABLE_SETTLEMENT_TEST === "true",
        items: snap.docs.map((d) => {
          const s = d.data() as SettlementDoc;
          return {
            id: d.id,
            streamerId: s.streamerId,
            streamerNickname: name(s.streamerId).nickname,
            masked: name(s.streamerId).masked,
            periodStart: iso(s.periodStart)!,
            periodEnd: iso(s.periodEnd)!,
            mode: s.mode,
            donationCount: s.donationCount,
            streamerShare: s.streamerShare,
            payout: s.payout,
            status: s.status,
            holdReason: s.holdReason,
            paidAt: iso(s.paidAt),
            transferId: s.transferId,
            mock: s.mock,
            hasSameIdentity: !!s.hasSameIdentity,
            streamerHeld: holdIds.has(s.streamerId),
            createdAt: iso(s.createdAt)!,
          };
        }),
        holds: [...holdIds].map((id) => ({ userId: id, ...name(id), reason: who.get(id)?.settlementHoldReason ?? "" })),
        runs: runSnap.docs.map((d) => {
          const r = d.data();
          return {
            id: d.id,
            jobName: r.jobName as string,
            mode: r.mode as "scheduled" | "test",
            adminNickname: (r.adminNickname as string | null) ?? null,
            startedAt: iso(r.startedAt as Timestamp)!,
            endedAt: iso(r.endedAt as Timestamp | null),
            streamerCount: r.streamerCount as number,
            result: r.result as string,
          };
        }),
      };
    },

    /** 방송자 단위 정산 보류(4-12). 대기 중인 기록은 모두 "보류(운영 조치)"가 되고, 이후 새 기록도 처음부터 그렇다. */
    async hold(admin: Viewer, uid: string, reason: string) {
      const target = await loadUser(uid);
      const refusal = sanctionRefusal(admin.user, target);
      if (refusal === "ADMIN_TARGET") throw forbidden("운영자의 정산은 보류할 수 없어요");
      if (refusal === "NOT_SEED") throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
      if (refusal === "PROTECTED_TEST") throw forbidden(TEST_ACCOUNT_PROTECTED_MESSAGE);
      await usersCol().doc(uid).update({ settlementHold: true, settlementHoldReason: reason, settlementHeldBy: admin.uid });
      const count = await holdOpenSettlements(uid, reason, admin.uid);
      if (count) await notify(uid, settlementHeld(reason, null));
      await adminLog(admin, { action: "정산 보류", targetType: "user", targetId: uid, targetNickname: target.nickname, targetSeed: !!target.seedKind, reason, before: "보류 없음", after: `보류(기록 ${count}건)` });
    },

    /** 보류 해제. "보류(운영 조치)" 기록은 "지급 대기"로 돌아가고 다음 실행에서 지급한다. */
    async release(admin: Viewer, uid: string, reason: string) {
      const target = await loadUser(uid);
      if (isTest(admin) && !inTestAdminScope(target.seedKind)) throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
      await usersCol().doc(uid).update({ settlementHold: false, settlementHoldReason: null, settlementHeldBy: null });
      const held = await settlementsCol().where("streamerId", "==", uid).where("status", "==", "heldAdmin").get();
      await updateAll(held.docs.map((d) => d.ref), { status: "pending" satisfies SettlementStatus, holdReason: null, heldBy: null });
      await adminLog(admin, { action: "정산 보류 해제", targetType: "user", targetId: uid, targetNickname: target.nickname, targetSeed: !!target.seedKind, reason, before: `보류(기록 ${held.size}건)`, after: "보류 없음" });
    },
  };
}

/** 예약 작업 실행기 입구 확인. 비밀 값(CRON_SECRET)이 없거나 다르면 403이다(4-12). */
export function assertCronSecret(authHeader: string | null) {
  const secret = process.env.CRON_SECRET;
  const given = authHeader?.match(/^Bearer (.+)$/)?.[1] ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw forbidden();
}

/** 한국 시간 기준 [연, 월(0부터)] */
function ymOf(now: Date): [number, number] {
  const t = new Date(now.getTime() + 9 * 3600_000);
  return [t.getUTCFullYear(), t.getUTCMonth()];
}
