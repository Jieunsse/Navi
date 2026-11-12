import { createHash } from "node:crypto";
import { DAILY_CHARGE_LIMIT, HONEY_NOTICE_VERSION, payAmount, type DonationOutcome, type Wallet } from "@nabi/shared/honey.ts";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import { createToss, type TossPayment, type TossPort } from "../adapters/toss.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { chargedToday, isAdult, koreanAge, kstDayStart, remainingToday } from "../domain/honey.ts";
import { AppError, badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { livekit } from "../container.ts";
import type { Viewer } from "./auth.ts";
import { bumpWallet, donationUseCases, planDonation, readDonationInputs, walletRef, writeDonation, type DonationEntry } from "./donation.ts";

type PendingDonation = { requestId: string; broadcastId: string; amount: number; message: string };
type ChargeDoc = {
  userId: string;
  honey: number;
  amount: number;
  remaining: number;
  status: "pending" | "done" | "failed";
  createdAt: Timestamp;
  returnTo: string | null;
  donation: PendingDonation | null;
  result?: DonationOutcome;
};
type ChargeResult = { honey: number; returnTo: string | null; donation: DonationOutcome };

const SEVEN_DAYS = 7 * 24 * 3600_000;
const charges = () => db().collection("charges");
const identities = () => db().collection("identityVerifications");
const safePath = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? p : null);
const sameResult = (c: ChargeDoc): ChargeResult => ({ honey: c.honey, returnTo: c.returnTo, donation: c.result ?? { status: "none" } });

export function honeyUseCases(toss: TossPort, lk: LiveKitPort) {
  const donations = donationUseCases(lk); // 방송 채팅에 후원 항목을 보내는 일은 후원 쪽과 같다

  async function todayCharges(uid: string, now: Date) {
    const snap = await charges().where("userId", "==", uid).where("createdAt", ">=", Timestamp.fromDate(kstDayStart(now))).get();
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
      if (c.status === "done") return sameResult(c);
      // 토스에서 다시 조회한 결과를 믿는다: 상태, 주문번호, 금액이 모두 맞아야 한다.
      if (p.status !== "DONE" || p.totalAmount !== c.amount) throw badRequest("PAYMENT_NOT_VALID", "결제를 확인하지 못했어요. 꿀은 들어가지 않았어요");

      const wallet = await tx.get(walletRef(c.userId));
      const balance = (wallet.data()?.balance as number | undefined) ?? 0;
      const inp = c.donation ? await readDonationInputs(tx, c.userId, { ...c.donation }) : null;

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
        cancelableUntil: Timestamp.fromMillis(now.toMillis() + SEVEN_DAYS),
        result: outcome,
      });
      tx.create(db().collection("honeyLedger").doc(), { userId: c.userId, type: "charge", amount: c.honey, chargeId: p.orderId, createdAt: now });
      bumpWallet(tx, c.userId, wallet.exists, c.honey - used);
      if (inp && usage.length) {
        entry = writeDonation(tx, inp, usage, p.orderId);
        room = inp.req.broadcastId;
      }
      return { honey: c.honey, returnTo: c.returnTo, donation: outcome };
    });
    if (entry) await lk.send(room, "donation", entry); // 저장이 끝난 뒤에 방 전체로 보낸다
    return result;
  }

  return {
    donate: donations.donate,

    async wallet(viewer: Viewer): Promise<Wallet> {
      const now = new Date();
      const [w, idDoc, chargeSnap, ledgerSnap, today] = await Promise.all([
        walletRef(viewer.uid).get(),
        identities().doc(viewer.uid).get(),
        charges().where("userId", "==", viewer.uid).orderBy("createdAt", "desc").limit(20).get(),
        db().collection("honeyLedger").where("userId", "==", viewer.uid).orderBy("createdAt", "desc").limit(30).get(),
        todayCharges(viewer.uid, now),
      ]);
      const used = chargedToday(today, now.getTime());
      return {
        balance: (w.data()?.balance as number | undefined) ?? 0,
        verified: idDoc.exists,
        adult: idDoc.exists && isAdult(idDoc.data()!.birth as string, now),
        todayCharged: used,
        todayRemaining: remainingToday(used),
        charges: chargeSnap.docs.map((d) => {
          const c = d.data() as ChargeDoc;
          return { id: d.id, honey: c.honey, amount: c.amount, remaining: c.remaining, status: c.status, createdAt: iso(c.createdAt)! };
        }),
        ledger: ledgerSnap.docs.map((d) => ({ id: d.id, type: d.data().type as "charge" | "donation", amount: d.data().amount as number, createdAt: iso(d.data().createdAt as Timestamp)! })),
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
      input: { honey: number; returnTo?: string; broadcastId?: string; donation?: { requestId: string; amount: number; message: string } },
    ) {
      const now = new Date();
      const idDoc = await identities().doc(viewer.uid).get();
      if (!idDoc.exists) throw forbidden("본인인증을 먼저 해 주세요");
      if (!isAdult(idDoc.data()!.birth as string, now)) throw new AppError(403, "ADULT_ONLY", "만 19세 이상만 꿀을 충전할 수 있어요");

      let donation: PendingDonation | null = null;
      if (input.donation) {
        if (!input.broadcastId) throw badRequest("INVALID", "후원할 방송이 필요해요");
        const b = (await db().collection("broadcasts").doc(input.broadcastId).get()).data();
        if (!b) throw notFound();
        if (b.ownerId === viewer.uid) throw forbidden("내 방송에는 후원할 수 없어요");
        if (b.status === "ended") throw conflict("BROADCAST_ENDED", "끝난 방송에는 후원할 수 없어요");
        donation = { ...input.donation, broadcastId: input.broadcastId };
      }

      const ref = charges().doc(`ch_${crypto.randomUUID()}`); // 주문번호 6~64자, 영문·숫자·-·_
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(charges().where("userId", "==", viewer.uid).where("createdAt", ">=", Timestamp.fromDate(kstDayStart(now))));
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
      if (c.status === "done") return sameResult(c);
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
    },
  };
}

let instance: ReturnType<typeof honeyUseCases> | undefined;
export const honey = () => (instance ??= honeyUseCases(createToss(), livekit()));
