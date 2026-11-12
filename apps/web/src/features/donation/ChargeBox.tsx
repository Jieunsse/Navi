"use client";
import { CHARGE_MAX, CHARGE_MIN, CHARGE_STEP, CHARGE_UNITS, HONEY_NOTICE_VERSION, honeyApi, payAmount, type Wallet } from "@nabi/shared/honey.ts";
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useState } from "react";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, cx, Input, Notice } from "@/shared/ui";
import { IdentityForm } from "./IdentityForm";
import { NoticeDialog } from "./NoticeDialog";

const won = (n: number) => n.toLocaleString("ko-KR");

export type PendingDonation = { broadcastId: string; requestId: string; amount: number; message: string };

/**
 * 충전 창 안쪽. 내 꿀 화면과 후원 창의 "충전하고 후원하기"가 함께 쓴다.
 * 본인인증을 안 했으면 결제 전에 본인인증 창을 먼저 보여준다.
 */
export function ChargeBox({ wallet, reload, returnTo, initialHoney, donation, submitLabel = "충전하기" }: {
  wallet: Wallet;
  reload: () => Promise<void> | void;
  returnTo: string;
  initialHoney?: number;
  donation?: PendingDonation;
  submitLabel?: string;
}) {
  const [honey, setHoney] = useState(initialHoney ?? CHARGE_UNITS[0]);
  const [showNotice, setShowNotice] = useState(false);
  const [needVerify, setNeedVerify] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = honey >= CHARGE_MIN && honey <= CHARGE_MAX && honey % CHARGE_STEP === 0;
  const overLimit = honey > wallet.todayRemaining;
  const blockedAdult = wallet.verified && !wallet.adult;

  async function pay() {
    setBusy(true);
    setError("");
    let orderId = "";
    try {
      const order = await apiFetch(honeyApi.createCharge, {
        honey,
        agreedVersion: HONEY_NOTICE_VERSION, // 결제 버튼을 누르는 것을 동의로 본다
        returnTo,
        ...(donation && { broadcastId: donation.broadcastId, donation: { requestId: donation.requestId, amount: donation.amount, message: donation.message } }),
      });
      orderId = order.orderId;
      const toss = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "");
      await toss.payment({ customerKey: ANONYMOUS }).requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.amount },
        orderId,
        orderName: order.orderName,
        successUrl: `${location.origin}/charge/success`,
        failUrl: `${location.origin}/charge/fail?next=${encodeURIComponent(returnTo)}`,
      });
    } catch (e) {
      // 결제창을 닫았거나 요청이 실패했다. 결제 대기를 닫아 오늘 한도를 되돌린다.
      if (orderId) void apiFetch(honeyApi.failCharge, { orderId }).catch(() => undefined);
      setError(e instanceof ApiError ? e.message : (e as { code?: string }).code === "USER_CANCEL" ? "결제를 취소했어요" : "결제를 시작하지 못했어요");
      setBusy(false);
    }
  }

  if (needVerify) {
    return (
      <IdentityForm
        onDone={async (adult) => {
          await reload();
          setNeedVerify(false);
          if (!adult) setError("만 19세 이상만 꿀을 충전할 수 있어요");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {CHARGE_UNITS.map((u) => (
          <button key={u} type="button" disabled={u > wallet.todayRemaining} onClick={() => setHoney(u)}
            className={cx("h-9 rounded-lg border px-3 text-sm disabled:opacity-40", honey === u ? "border-accent text-accent" : "border-line text-muted")}>
            {won(u)}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">충전할 꿀 (1,000꿀 단위)</span>
        <Input inputMode="numeric" value={honey ? won(honey) : ""} invalid={honey > 0 && (!valid || overLimit)} onChange={(e) => setHoney(Number(e.target.value.replace(/\D/g, "")))} />
      </label>
      <p className="text-sm">결제 금액 <b>{valid ? won(payAmount(honey)) : "-"}원</b> <span className="text-muted">(부가세 10% 포함)</span></p>
      <p className="text-xs text-muted">오늘은 {won(1_000_000)}꿀까지 충전할 수 있어요. 남은 한도는 {won(wallet.todayRemaining)}꿀이에요</p>
      {valid && overLimit && <p className="text-xs text-danger">남은 한도를 넘었어요</p>}
      {blockedAdult && <p className="text-xs text-danger">만 19세 이상만 꿀을 충전할 수 있어요</p>}
      <Notice tone="warn">테스트 결제라 실제 돈이 나가지 않아요</Notice>
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button loading={busy} disabled={!valid || overLimit || blockedAdult} onClick={wallet.verified ? pay : () => setNeedVerify(true)}>
        {wallet.verified ? submitLabel : "본인인증하고 충전하기"}
      </Button>
      <p className="text-xs text-muted">
        꿀 충전과 후원 유의사항에 동의합니다{" "}
        <button type="button" onClick={() => setShowNotice(true)} className="underline">안내 보기</button>
      </p>
      {showNotice && <NoticeDialog onClose={() => setShowNotice(false)} />}
    </div>
  );
}
