import { createHash } from "node:crypto";
import { ACTIVE_REFUND_STATUSES, CANCEL_WINDOW_MS, DAILY_CHARGE_LIMIT, HONEY_NOTICE_VERSION, payAmount, refundQuote, type DonationOutcome, type Wallet } from "@nabi/shared/honey.ts";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import { createToss, type TossPayment, type TossPort } from "../adapters/toss.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { chargedToday, isAdult, koreanAge, kstDayStart, remainingToday } from "../domain/honey.ts";
import { cancelRefusal, isStaleCancel, refundable } from "../domain/refund.ts";
import { AppError, badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { livekit } from "../container.ts";
import type { Viewer } from "./auth.ts";
import { getBannedWords } from "./bannedWords.ts";
import { assertMissionContent, bumpWallet, donationUseCases, planDonation, readDonationInputs, walletRef, writeDonation, type DonationEntry, type DonationReq } from "./donation.ts";

/** 충전 주문에 고정해 두는 후원 정보(4-8). 예전에 만든 주문에는 kind와 anonymous가 없다. */
type PendingDonation = { kind?: "chat" | "mission"; requestId: string; broadcastId: string; amount: number; message: string; anonymous?: boolean; limitMinutes?: number };
type ChargeDoc = {
  userId: string;
  honey: number;
  amount: number;
  remaining: number;
  status: "pending" | "done" | "failed" | "canceling" | "canceled";
  createdAt: Timestamp;
  returnTo: string | null;
  donation: PendingDonation | null;
  result?: DonationOutcome;
  paymentKey?: string | null;
  cancelableUntil?: Timestamp | null;
  cancelRequestedAt?: Timestamp | null;
};
export type RefundDoc = {
  userId: string;
  honey: number;
  base: number;
  fee: number;
  payout: number;
  charges: { chargeId: string; amount: number }[];
  bank: string;
  last4: string;
  holder: string;
  status: "pending" | "sending" | "done" | "rejected" | "failed";
  rejectReason?: string | null;
  createdAt: Timestamp;
};
type ChargeResult = { honey: number; returnTo: string | null; donation: DonationOutcome };

const charges = () => db().collection("charges");
const identities = () => db().collection("identityVerifications");
const safePath = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? p : null);
const toReq = (d: PendingDonation): DonationReq => ({ ...d, kind: d.kind ?? "chat", anonymous: !!d.anonymous });
// 확정했거나 이미 취소 단계에 들어간 충전은 결제 확정을 다시 하지 않는다. 취소 중인 결제를 웹훅이 되살리지 못하게 한다.
const isSettled = (s: ChargeDoc["status"]) => s === "done" || s === "canceling" || s === "canceled";
const sameResult = (c: ChargeDoc): ChargeResult => ({ honey: c.honey, returnTo: c.returnTo, donation: c.result ?? { status: "none" } });

export function honeyUseCases(toss: TossPort, lk: LiveKitPort) {
  const donations = donationUseCases(lk); // 방송 채팅에 후원 항목을 보내는 일은 후원 쪽과 같다

  /** 하루 한도를 세기 시작하는 때: 오늘 0시와 마지막 부분 초기화 시각 중 늦은 쪽(4-18, 결정 27) */
  async function limitFrom(uid: string, now: Date) {
    const reset = (await db().collection("users").doc(uid).get()).data()?.lastPartialResetAt as Timestamp | undefined;
    const day = kstDayStart(now);
    return reset && reset.toMillis() > day.getTime() ? reset.toDate() : day;
  }

  async function todayCharges(uid: string, now: Date) {
    const snap = await charges().where("userId", "==", uid).where("createdAt", ">=", Timestamp.fromDate(await limitFrom(uid, now))).get();
    return snap.docs.map((d) => ({ honey: d.data().honey as number, status: d.data().status as string, createdAtMs: (d.data().createdAt as Timestamp).toMillis() }));
  }

  /**
   * 충전 확정. 결제 성공 화면과 웹훅이 모두 이 함수를 부른다(7장).
   * 이미 확정된 주문이면 저장해 둔 결과만 돌려주므로 꿀은 한 번만 들어간다.
   * 지갑, 꿀 내역, 충전 건, (후원이 있으면) 후원·방송 합계를 트랜잭션 하나로 바꾼다.
   */
  async function settle(p: TossPayment): Promise<ChargeResult> {
    const ref = charges().doc(p.orderId);
    let entry: DonationEntry | null = null;
    let room = "";
    const result = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw notFound("충전 주문을 찾을 수 없어요");
      const c = snap.data() as ChargeDoc;
      if (isSettled(c.status)) return sameResult(c);
      // 토스에서 다시 조회한 결과를 믿는다: 상태, 주문번호, 금액이 모두 맞아야 한다.
      if (p.status !== "DONE" || p.totalAmount !== c.amount) throw badRequest("PAYMENT_NOT_VALID", "결제를 확인하지 못했어요. 꿀은 들어가지 않았어요");

      const wallet = await tx.get(walletRef(c.userId));
      const balance = (wallet.data()?.balance as number | undefined) ?? 0;
      const inp = c.donation ? await readDonationInputs(tx, c.userId, toReq(c.donation)) : null;

      const now = Timestamp.now();
      const fresh = { id: p.orderId, remaining: c.honey, approvedAtMs: now.toMillis() };
      let outcome: DonationOutcome = { status: "none" };
      let usage: { chargeId: string; amount: number }[] = [];
      if (inp) {
        const plan = inp.existing ? null : planDonation(inp, balance + c.honey, fresh);
        if (!plan) outcome = { status: "done" };
        else if ("error" in plan) {
          const { code, message } = plan.error;
          outcome = { status: "skipped", reason: code === "BROADCAST_ENDED" ? "방송이 끝나서 후원하지 못했어요. 충전한 꿀은 내 꿀에 남아 있어요" : `후원하지 못했어요(${message}). 충전한 꿀은 내 꿀에 남아 있어요` };
        } else {
          usage = plan.usage;
          outcome = { status: "done" };
        }
      }
      const used = usage.reduce((s, u) => s + u.amount, 0);

      tx.update(ref, {
        status: "done",
        remaining: c.honey - (usage.find((u) => u.chargeId === p.orderId)?.amount ?? 0), // 이 충전 건에서 쓴 만큼만 뺀다
        paymentKey: p.paymentKey,
        approvedAt: now,
        cancelableUntil: Timestamp.fromMillis(now.toMillis() + CANCEL_WINDOW_MS),
        result: outcome,
      });
      tx.create(db().collection("honeyLedger").doc(), { userId: c.userId, type: "charge", amount: c.honey, chargeId: p.orderId, createdAt: now });
      bumpWallet(tx, c.userId, wallet.exists, { balance: c.honey - used, pendingMission: inp?.req.kind === "mission" ? used : 0 });
      if (inp && usage.length) {
        entry = writeDonation(tx, inp, usage, p.orderId);
        room = inp.req.broadcastId;
      }
      return { honey: c.honey, returnTo: c.returnTo, donation: outcome };
    });
    if (entry) await lk.send(room, (entry as DonationEntry).kind === "mission" ? "mission" : "donation", entry); // 저장이 끝난 뒤에 방 전체로 보낸다
    return result;
  }

  // ---- 충전 취소(4-8): 두 단계로 처리한다. 먼저 꿀을 빼고 "취소 중"으로 바꾼 뒤 토스를 부른다.
  /** "취소 중" → "취소". 이미 끝났으면 아무것도 하지 않는다. */
  async function finishCancel(chargeId: string) {
    const ref = charges().doc(chargeId);
    await db().runTransaction(async (tx) => {
      const c = (await tx.get(ref)).data() as ChargeDoc | undefined;
      if (c?.status === "canceling") tx.update(ref, { status: "canceled", canceledAt: Timestamp.now() });
    });
  }

  /** "취소 중" → "완료". 빼 둔 꿀을 돌려준다(꿀 내역 "충전 취소 실패 반환"). */
  async function revertCancel(chargeId: string) {
    const ref = charges().doc(chargeId);
    await db().runTransaction(async (tx) => {
      const c = (await tx.get(ref)).data() as ChargeDoc | undefined;
      if (!c || c.status !== "canceling") return;
      const wallet = await tx.get(walletRef(c.userId));
      const now = Timestamp.now();
      tx.update(ref, { status: "done", remaining: c.honey, cancelRequestedAt: null });
      bumpWallet(tx, c.userId, wallet.exists, { balance: c.honey });
      tx.create(db().collection("honeyLedger").doc(), { userId: c.userId, type: "chargeCancelRevert", amount: c.honey, chargeId, createdAt: now });
    });
  }

  /** 결과를 모를 때 토스 결제 조회로 마지막 상태를 정한다(결정 26). 조회도 못 하면 "취소 중"으로 둔다. */
  async function reconcileCancel(chargeId: string): Promise<"canceled" | "reverted" | "canceling"> {
    const c = (await charges().doc(chargeId).get()).data() as ChargeDoc | undefined;
    if (!c || c.status !== "canceling" || !c.paymentKey) return c?.status === "canceled" ? "canceled" : "canceling";
    const p = await toss.get(c.paymentKey).catch(() => null);
    if (p?.status === "CANCELED") return (await finishCancel(chargeId), "canceled");
    if (p?.status === "DONE") return (await revertCancel(chargeId), "reverted");
    return "canceling";
  }

  async function reconcileStale(uid: string, nowMs: number) {
    const snap = await charges().where("userId", "==", uid).where("status", "==", "canceling").get();
    for (const d of snap.docs) {
      if (isStaleCancel((d.data().cancelRequestedAt as Timestamp | null)?.toMillis() ?? null, nowMs)) await reconcileCancel(d.id).catch(() => undefined);
    }
  }

  return {
    donate: donations.donate,
    donateMission: donations.donateMission,
    reconcileCancel, // 운영자 화면의 멈춘 "취소 중" 정리(4-15)

    async wallet(viewer: Viewer): Promise<Wallet> {
      const now = new Date();
      await reconcileStale(viewer.uid, now.getTime()); // 5분 넘게 멈춘 충전 취소를 먼저 정리한다(결정 26)
      const [w, idDoc, chargeSnap, doneSnap, ledgerSnap, refundSnap, today] = await Promise.all([
        walletRef(viewer.uid).get(),
        identities().doc(viewer.uid).get(),
        charges().where("userId", "==", viewer.uid).orderBy("createdAt", "desc").limit(20).get(),
        charges().where("userId", "==", viewer.uid).where("status", "==", "done").get(),
        db().collection("honeyLedger").where("userId", "==", viewer.uid).orderBy("createdAt", "desc").limit(30).get(),
        db().collection("refunds").where("userId", "==", viewer.uid).get(),
        todayCharges(viewer.uid, now),
      ]);
      const used = chargedToday(today, now.getTime());
      const nowMs = now.getTime();
      const candidate = (c: ChargeDoc) => ({ status: c.status, honey: c.honey, remaining: c.remaining, cancelableUntilMs: c.cancelableUntil?.toMillis() ?? null });
      const refunds = refundSnap.docs.map((d) => ({ id: d.id, ...(d.data() as RefundDoc) })).sort((x, y) => y.createdAt.toMillis() - x.createdAt.toMillis());
      const r = refundable(doneSnap.docs.map((d) => ({ id: d.id, ...candidate(d.data() as ChargeDoc) })), nowMs);
      const hasActiveRefund = refunds.some((x) => (ACTIVE_REFUND_STATUSES as readonly string[]).includes(x.status));
      const verified = idDoc.exists;
      return {
        balance: (w.data()?.balance as number | undefined) ?? 0,
        pendingMission: (w.data()?.pendingMission as number | undefined) ?? 0,
        pendingRefund: (w.data()?.pendingRefund as number | undefined) ?? 0,
        identityName: (idDoc.data()?.name as string | undefined) ?? null,
        verified,
        adult: verified && isAdult(idDoc.data()!.birth as string, now),
        todayCharged: used,
        todayRemaining: remainingToday(used),
        charges: chargeSnap.docs.map((d) => {
          const c = d.data() as ChargeDoc;
          return {
            id: d.id,
            honey: c.honey,
            amount: c.amount,
            remaining: c.remaining,
            status: c.status,
            createdAt: iso(c.createdAt)!,
            cancelable: cancelRefusal(candidate(c), nowMs) === null,
            cancelableUntil: iso(c.cancelableUntil),
          };
        }),
        ledger: ledgerSnap.docs.map((d) => ({ id: d.id, type: d.data().type as string, amount: d.data().amount as number, createdAt: iso(d.data().createdAt as Timestamp)! })),
        refund: { refundable: r.total, cancelableHoney: r.cancelable, ...refundQuote(r.total), canApply: r.canApply && verified && !hasActiveRefund },
        refunds: refunds.slice(0, 10).map((x) => ({
          id: x.id,
          honey: x.honey,
          payout: x.payout,
          bank: x.bank,
          last4: x.last4,
          status: x.status,
          rejectReason: x.rejectReason ?? null,
          createdAt: iso(x.createdAt)!,
        })),
      };
    },

    /** 본인인증 목업(4-8). 입력만 받고 이름·생년월일·확인값(해시)만 저장한다. 휴대폰 번호는 저장하지 않는다. */
    async verifyIdentity(viewer: Viewer, input: { name: string; birth: string; phone: string }) {
      const now = new Date();
      if (Number.isNaN(koreanAge(input.birth, now))) throw badRequest("INVALID_BIRTH", "생년월일을 확인해 주세요");
      const adult = isAdult(input.birth, now);
      const identityHash = createHash("sha256").update(`${input.name}|${input.birth}|${input.phone}`).digest("hex");
      await identities()
        .doc(viewer.uid)
        .create({ name: input.name, birth: input.birth, identityHash, mock: true, verifiedAt: Timestamp.now() })
        .catch((e: { code?: number }) => {
          throw e.code === 6 ? conflict("ALREADY_VERIFIED", "이미 본인인증을 했어요") : e;
        });
      return { adult };
    },

    /** 충전 주문. 금액과 함께 보낼 후원 정보를 이때 서버에 고정한다(4-8). */
    async createCharge(
      viewer: Viewer,
      input: {
        honey: number;
        returnTo?: string;
        broadcastId?: string;
        donation?: { requestId: string; amount: number; message: string; anonymous: boolean };
        mission?: { requestId: string; amount: number; content: string; limitMinutes: number; anonymous: boolean };
      },
    ) {
      const now = new Date();
      const idDoc = await identities().doc(viewer.uid).get();
      if (!idDoc.exists) throw forbidden("본인인증을 먼저 해 주세요");
      if (!isAdult(idDoc.data()!.birth as string, now)) throw new AppError(403, "ADULT_ONLY", "만 19세 이상만 꿀을 충전할 수 있어요");

      let donation: PendingDonation | null = null;
      if (input.donation || input.mission) {
        if (input.donation && input.mission) throw badRequest("INVALID", "채팅 후원과 미션 후원은 함께 보낼 수 없어요");
        if (!input.broadcastId) throw badRequest("INVALID", "후원할 방송이 필요해요");
        const b = (await db().collection("broadcasts").doc(input.broadcastId).get()).data();
        if (!b) throw notFound();
        if (b.ownerId === viewer.uid) throw forbidden("내 방송에는 후원할 수 없어요");
        if (b.status === "ended") throw conflict("BROADCAST_ENDED", "끝난 방송에는 후원할 수 없어요");
        if (input.mission) {
          assertMissionContent(input.mission.content, await getBannedWords());
          if (b.status !== "live") throw conflict("MISSION_NOT_LIVE", "방송이 시작되면 미션을 보낼 수 있어요");
          const { content, ...m } = input.mission;
          donation = { ...m, kind: "mission", message: content, broadcastId: input.broadcastId }; // 후원 정보를 이때 고정한다(결정 28)
        } else donation = { ...input.donation!, kind: "chat", broadcastId: input.broadcastId };
      }

      const ref = charges().doc(`ch_${crypto.randomUUID()}`); // 주문번호 6~64자, 영문·숫자·-·_
      const from = await limitFrom(viewer.uid, now);
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(charges().where("userId", "==", viewer.uid).where("createdAt", ">=", Timestamp.fromDate(from)));
        const used = chargedToday(
          snap.docs.map((d) => ({ honey: d.data().honey as number, status: d.data().status as string, createdAtMs: (d.data().createdAt as Timestamp).toMillis() })),
          now.getTime(),
        );
        if (used + input.honey > DAILY_CHARGE_LIMIT) {
          throw new AppError(400, "DAILY_LIMIT", `오늘은 ${DAILY_CHARGE_LIMIT.toLocaleString("ko-KR")}꿀까지 충전할 수 있어요. 남은 한도는 ${remainingToday(used).toLocaleString("ko-KR")}꿀이에요`);
        }
        tx.create(ref, {
          userId: viewer.uid,
          honey: input.honey,
          amount: payAmount(input.honey),
          remaining: 0, // 결제가 확정되면 honey로 바뀐다
          status: "pending",
          createdAt: Timestamp.fromDate(now),
          agreement: { noticeVersion: HONEY_NOTICE_VERSION, agreedAt: Timestamp.fromDate(now) },
          returnTo: safePath(input.returnTo),
          donation,
          paymentKey: null,
          approvedAt: null,
          cancelableUntil: null,
        });
      });
      return { orderId: ref.id, amount: payAmount(input.honey), orderName: `꿀 ${input.honey.toLocaleString("ko-KR")}개` };
    },

    /** 결제 성공 화면에서 부른다. 금액을 주문과 맞춰 보고, 승인하고, 다시 조회한 뒤 확정한다. */
    async confirmByUser(viewer: Viewer, input: { paymentKey: string; orderId: string; amount: number }): Promise<ChargeResult> {
      const snap = await charges().doc(input.orderId).get();
      if (!snap.exists) throw notFound("충전 주문을 찾을 수 없어요");
      const c = snap.data() as ChargeDoc;
      if (c.userId !== viewer.uid) throw forbidden();
      if (isSettled(c.status)) return sameResult(c);
      if (input.amount !== c.amount) throw badRequest("AMOUNT_MISMATCH", "결제 금액이 주문과 달라요. 꿀은 들어가지 않았어요");

      let approveError: unknown;
      await toss.confirm(input.paymentKey, input.orderId, c.amount).catch((e) => (approveError = e));
      // 승인 응답을 모를 수 있어서(시간 초과 등) 결과는 늘 조회로 확인한다(4-8).
      const p = await toss.get(input.paymentKey).catch((e) => {
        throw approveError ?? e;
      });
      if (p.orderId !== input.orderId) throw badRequest("PAYMENT_NOT_VALID", "결제를 확인하지 못했어요");
      if (p.status !== "DONE") throw approveError ?? badRequest("PAYMENT_NOT_VALID", "결제가 완료되지 않았어요");
      return settle(p);
    },

    /** 충전 취소. 결과가 확정되지 않으면 "canceling"을 돌려준다(그동안 그 꿀은 쓸 수 없다). */
    async cancelCharge(viewer: Viewer, chargeId: string): Promise<{ status: "canceled" | "canceling" }> {
      const ref = charges().doc(chargeId);
      const paymentKey = await db().runTransaction(async (tx) => {
        const [snap, wallet] = await Promise.all([tx.get(ref), tx.get(walletRef(viewer.uid))]);
        const c = snap.data() as ChargeDoc | undefined;
        if (!c) throw notFound("충전 내역을 찾을 수 없어요");
        if (c.userId !== viewer.uid) throw forbidden();
        const now = Timestamp.now();
        // 조건을 트랜잭션 안에서 다시 확인한다. "취소 중"인 건에 온 두 번째 요청은 여기서 거절된다.
        const refusal = cancelRefusal({ status: c.status, honey: c.honey, remaining: c.remaining, cancelableUntilMs: c.cancelableUntil?.toMillis() ?? null }, now.toMillis());
        if (refusal) throw conflict("CANCEL_NOT_ALLOWED", refusal);
        if (!c.paymentKey) throw conflict("CANCEL_NOT_ALLOWED", "결제 정보가 없어 취소할 수 없어요");
        if (((wallet.data()?.balance as number | undefined) ?? 0) < c.honey) throw conflict("CANCEL_NOT_ALLOWED", "꿀이 모자라서 취소할 수 없어요");
        tx.update(ref, { status: "canceling", remaining: 0, cancelRequestedAt: now });
        bumpWallet(tx, viewer.uid, true, { balance: -c.honey });
        tx.create(db().collection("honeyLedger").doc(), { userId: viewer.uid, type: "chargeCancel", amount: -c.honey, chargeId, createdAt: now });
        return c.paymentKey;
      });

      try {
        await toss.cancel(paymentKey, "고객 요청으로 충전 취소", `cancel_${chargeId}`);
      } catch (e) {
        // 토스가 400·404로 분명히 거절했을 때만 실패로 본다. 이미 취소된 결제는 취소로 끝낸다.
        if (e instanceof AppError && e.code !== "ALREADY_CANCELED_PAYMENT" && (e.status === 400 || e.status === 404)) {
          await revertCancel(chargeId);
          throw badRequest("CANCEL_FAILED", `결제를 취소하지 못했어요(${e.message}). 꿀은 그대로예요`);
        }
        if (!(e instanceof AppError && e.code === "ALREADY_CANCELED_PAYMENT")) {
          // 서버 오류, 시간 초과, 끊김: 결과를 모른다. 조회로 확인하고, 그래도 모르면 "취소 중"으로 둔다.
          const r = await reconcileCancel(chargeId);
          if (r === "reverted") throw badRequest("CANCEL_FAILED", "결제를 취소하지 못했어요. 꿀은 그대로예요");
          return { status: r };
        }
      }
      await finishCancel(chargeId);
      return { status: "canceled" };
    },

    /** 결제창에서 실패·취소했을 때 결제 대기를 실패로 닫아 하루 한도를 되돌린다. 결제 대기만 바꾼다. */
    async failCharge(viewer: Viewer, orderId: string) {
      const ref = charges().doc(orderId);
      await db().runTransaction(async (tx) => {
        const c = (await tx.get(ref)).data() as ChargeDoc | undefined;
        if (!c) throw notFound("충전 주문을 찾을 수 없어요");
        if (c.userId !== viewer.uid) throw forbidden();
        if (c.status === "pending") tx.update(ref, { status: "failed" });
      });
    },

    /** 토스 웹훅. 본문은 믿지 않고 결제 키로 다시 조회한다(7장). */
    async onTossWebhook(body: { eventType?: string; data?: { paymentKey?: string } }) {
      const key = body.data?.paymentKey;
      if (body.eventType !== "PAYMENT_STATUS_CHANGED" || !key) return;
      const p = await toss.get(key).catch((e) => (e instanceof AppError && e.status < 500 ? null : Promise.reject(e))); // 우리 결제가 아니면 무시
      // 주문이 없거나 금액이 다른 알림은 다시 보내 봐야 같으므로 오류로 돌려보내지 않는다.
      if (p?.status === "DONE") await settle(p).catch((e) => { if (!(e instanceof AppError)) throw e; });
      // 취소가 끝났다는 알림이고 우리 충전이 "취소 중"이면 "취소"로 끝낸다(7장)
      else if (p?.status === "CANCELED") await finishCancel(p.orderId);
    },
  };
}

let instance: ReturnType<typeof honeyUseCases> | undefined;
export const honey = () => (instance ??= honeyUseCases(createToss(), livekit()));
