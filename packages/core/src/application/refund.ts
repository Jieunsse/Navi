import { ACTIVE_REFUND_STATUSES, refundQuote, type AdminRefund, type RefundStatus } from "@nabi/shared/honey.ts";
import { MASKED_NICKNAME, TEST_ADMIN_SCOPE_MESSAGE } from "@nabi/shared/moderation.ts";
import { db, FieldValue, iso, Timestamp } from "../adapters/firebase.ts";
import { refundable } from "../domain/refund.ts";
import { inTestAdminScope } from "../domain/moderation.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { refundDone, refundRejected } from "../domain/notification.ts";
import { bumpWallet, walletRef } from "./donation.ts";
import { writeNotification } from "./notification.ts";
import type { RefundDoc } from "./honey.ts";

/** 송금 목업(결정 22). 실제 송금을 붙일 때 이 함수만 바꾼다. 정산 송금 목업과 같은 모양이다. */
export type PayoutFn = (refundId: string, amount: number) => Promise<{ transferId: string; mock: boolean }>;
export const mockPayout: PayoutFn = async (refundId) => ({ transferId: `mock_${refundId}`, mock: true });

const refunds = () => db().collection("refunds");
const isTest = (v: Viewer) => !!v.user.isTestAdmin;
const ACTIVE: RefundStatus[] = [...ACTIVE_REFUND_STATUSES];

export function refundUseCases(payout: PayoutFn = mockPayout) {
  async function log(admin: Viewer, e: { targetId: string; targetNickname: string; targetSeed: boolean; reason: string; action: string; before: string; after: string }) {
    await db().collection("adminLogs").add({ adminId: admin.uid, adminNickname: admin.user.nickname, targetType: "refund", ...e, createdAt: Timestamp.now() });
  }

  /** 테스트 운영자는 시드 계정의 환급만 처리한다(결정 23, 25). 실제 운영자는 모두 처리한다. */
  async function loadTarget(admin: Viewer, id: string) {
    const snap = await refunds().doc(id).get();
    if (!snap.exists) throw notFound("환급 신청을 찾을 수 없어요");
    const r = snap.data() as RefundDoc;
    const user = (await db().collection("users").doc(r.userId).get()).data() as { nickname?: string; seedKind?: string | null } | undefined;
    if (isTest(admin) && !inTestAdminScope(user?.seedKind)) throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
    return { r, nickname: user?.nickname ?? "(탈퇴한 사용자)", seed: !!user?.seedKind };
  }

  return {
    /** 환급 신청(4-8). 환급할 꿀을 다시 계산해서 잔액에서 빼 "환급 대기"로 묶는다. 신청 번호로 한 번만 처리한다. */
    async apply(viewer: Viewer, input: { requestId: string; bank: string; accountNumber: string }) {
      const now = new Date();
      const idDoc = await db().collection("identityVerifications").doc(viewer.uid).get();
      if (!idDoc.exists) throw forbidden("본인인증을 한 뒤에 환급을 신청할 수 있어요");
      const holder = idDoc.data()!.name as string; // 예금주는 본인인증 이름으로 채운다(목업)

      await db().runTransaction(async (tx) => {
        const ref = refunds().doc(input.requestId);
        const [existing, active, wallet, done] = await Promise.all([
          tx.get(ref),
          tx.get(refunds().where("userId", "==", viewer.uid).where("status", "in", ACTIVE).limit(1)),
          tx.get(walletRef(viewer.uid)),
          tx.get(db().collection("charges").where("userId", "==", viewer.uid).where("status", "==", "done")),
        ]);
        if (existing.exists) {
          if ((existing.data() as RefundDoc).userId !== viewer.uid) throw conflict("DUPLICATE_REQUEST", "이미 쓰고 있는 요청 번호예요");
          return; // 같은 요청이 다시 왔다. 처음 결과 그대로다.
        }
        if (!active.empty) throw conflict("REFUND_ACTIVE", "처리 중인 환급 신청이 있어요");
        const r = refundable(
          done.docs.map((d) => {
            const c = d.data();
            return { id: d.id, status: "done", honey: c.honey as number, remaining: c.remaining as number, cancelableUntilMs: (c.cancelableUntil as Timestamp | null)?.toMillis() ?? null };
          }),
          now.getTime(),
        );
        if (!r.canApply) throw badRequest("REFUND_TOO_SMALL", "환급할 수 있는 꿀이 1,000꿀보다 적어요");
        if (((wallet.data()?.balance as number | undefined) ?? 0) < r.total) throw conflict("INSUFFICIENT", "꿀이 모자라요. 잔액을 다시 확인해 주세요");

        const q = refundQuote(r.total);
        const ts = Timestamp.fromDate(now);
        const doc: RefundDoc = {
          userId: viewer.uid,
          honey: r.total,
          ...q,
          charges: r.items,
          bank: input.bank,
          last4: input.accountNumber.slice(-4), // 은행 이름, 끝 4자리, 예금주만 저장한다(결정 22)
          holder,
          status: "pending",
          createdAt: ts,
        };
        tx.create(ref, { ...doc, processedBy: null, rejectReason: null, transferId: null, mock: true, processedAt: null });
        bumpWallet(tx, viewer.uid, true, { balance: -r.total, pendingRefund: r.total });
        tx.create(db().collection("honeyLedger").doc(), { userId: viewer.uid, type: "refundHold", amount: -r.total, refundId: input.requestId, createdAt: ts });
        for (const i of r.items) tx.update(db().collection("charges").doc(i.chargeId), { remaining: 0 }); // 묶은 꿀이 들어 있는 충전 건은 0으로
      });
    },

    /** 처리할 환급 신청과 최근 처리한 것(4-15). 테스트 운영자에게 실제 사용자 줄은 가린다. */
    async list(admin: Viewer): Promise<AdminRefund[]> {
      const snap = await refunds().orderBy("createdAt", "desc").limit(50).get();
      const rows = snap.docs.map((d) => ({ id: d.id, r: d.data() as RefundDoc }));
      const uids = [...new Set(rows.map((x) => x.r.userId))];
      const users = uids.length ? await db().getAll(...uids.map((u) => db().collection("users").doc(u))) : [];
      const userOf = new Map(users.map((u) => [u.id, u.data() as { nickname?: string; seedKind?: string | null } | undefined]));
      return Promise.all(
        rows.map(async ({ id, r }): Promise<AdminRefund> => {
          const u = userOf.get(r.userId);
          const masked = isTest(admin) && !inTestAdminScope(u?.seedKind);
          const [cs, ds] = masked
            ? [null, null]
            : await Promise.all([
                db().collection("charges").where("userId", "==", r.userId).orderBy("createdAt", "desc").limit(3).get(),
                db().collection("donations").where("donorId", "==", r.userId).orderBy("createdAt", "desc").limit(3).get(),
              ]);
          return {
            id,
            masked,
            nickname: masked ? MASKED_NICKNAME : (u?.nickname ?? "(탈퇴한 사용자)"),
            honey: r.honey,
            base: r.base,
            fee: r.fee,
            payout: r.payout,
            account: masked ? "" : `${r.bank} ****${r.last4} (${r.holder})`,
            status: r.status,
            reason: masked ? null : (r.rejectReason ?? null),
            createdAt: iso(r.createdAt)!,
            recentCharges: cs?.docs.map((d) => ({ honey: d.data().honey as number, status: d.data().status as string, createdAt: iso(d.data().createdAt as Timestamp)! })) ?? [],
            recentDonations: ds?.docs.map((d) => ({ amount: d.data().amount as number, kind: d.data().kind as string, createdAt: iso(d.data().createdAt as Timestamp)! })) ?? [],
          };
        }),
      );
    },

    /** 승인은 두 단계다(결정 25). 먼저 "송금 중"으로 바꾸고, 송금 함수를 부르고, 결과로 마지막 상태를 정한다. */
    async approve(admin: Viewer, id: string): Promise<{ status: RefundStatus }> {
      const target = await loadTarget(admin, id);
      const ref = refunds().doc(id);
      const before = await db().runTransaction(async (tx) => {
        const r = (await tx.get(ref)).data() as RefundDoc | undefined;
        if (!r) throw notFound("환급 신청을 찾을 수 없어요");
        // 다른 운영자가 같은 신청을 동시에 눌러도 둘째 요청은 "송금 중"을 보고 거절된다.
        if (r.status !== "pending" && r.status !== "failed") throw conflict("REFUND_STATE", "이미 처리 중이거나 끝난 신청이에요");
        tx.update(ref, { status: "sending", processedBy: admin.uid });
        return r.status;
      });

      let sent: Awaited<ReturnType<PayoutFn>> | null = null;
      let failReason = "";
      try {
        sent = await payout(id, target.r.payout);
      } catch (e) {
        failReason = e instanceof Error ? e.message : "송금에 실패했어요";
      }

      const status: RefundStatus = sent ? "done" : "failed";
      await db().runTransaction(async (tx) => {
        const now = Timestamp.now();
        if (sent) {
          // 묶은 꿀을 없앤다. 잔액은 그대로다(꿀 내역 "환급", 0).
          tx.update(ref, { status, transferId: sent.transferId, mock: sent.mock, processedAt: now, rejectReason: null });
          tx.update(walletRef(target.r.userId), { pendingRefund: FieldValue.increment(-target.r.honey), updatedAt: now });
          tx.create(db().collection("honeyLedger").doc(), { userId: target.r.userId, type: "refund", amount: 0, refundId: id, createdAt: now });
          writeNotification(tx, target.r.userId, refundDone(target.r.payout, id));
        } else tx.update(ref, { status, rejectReason: failReason, processedAt: now });
      });
      await log(admin, {
        action: sent ? "환급 승인" : "환급 송금 실패",
        targetId: id,
        targetNickname: target.nickname,
        targetSeed: target.seed,
        reason: sent ? `${target.r.payout.toLocaleString("ko-KR")}원 송금(테스트)` : failReason,
        before: before === "failed" ? "송금 실패" : "대기",
        after: sent ? "환급 완료(테스트)" : "송금 실패",
      });
      return { status };
    },

    /** 거절: 사유를 적고 묶은 꿀을 잔액으로 돌려준다. 대기와 송금 실패인 신청만 거절할 수 있다. */
    async reject(admin: Viewer, id: string, reason: string) {
      const target = await loadTarget(admin, id);
      const ref = refunds().doc(id);
      const before = await db().runTransaction(async (tx) => {
        const r = (await tx.get(ref)).data() as RefundDoc | undefined;
        if (!r) throw notFound("환급 신청을 찾을 수 없어요");
        if (r.status !== "pending" && r.status !== "failed") throw conflict("REFUND_STATE", "이미 처리 중이거나 끝난 신청이에요");
        const now = Timestamp.now();
        tx.update(ref, { status: "rejected", rejectReason: reason, processedBy: admin.uid, processedAt: now });
        tx.update(walletRef(r.userId), { balance: FieldValue.increment(r.honey), pendingRefund: FieldValue.increment(-r.honey), updatedAt: now });
        tx.create(db().collection("honeyLedger").doc(), { userId: r.userId, type: "refundReturn", amount: r.honey, refundId: id, createdAt: now });
        for (const c of r.charges) tx.update(db().collection("charges").doc(c.chargeId), { remaining: FieldValue.increment(c.amount) }); // 신청에 적은 충전 건별 꿀을 되살린다
        writeNotification(tx, r.userId, refundRejected(reason, id));
        return r.status;
      });
      await log(admin, { action: "환급 거절", targetId: id, targetNickname: target.nickname, targetSeed: target.seed, reason, before: before === "failed" ? "송금 실패" : "대기", after: "거절" });
    },
  };
}
