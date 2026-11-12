"use client";
import { CHARGE_MAX, CHARGE_MIN, CHARGE_STEP, CHARGE_UNITS, HONEY_NOTICE_VERSION, honeyApi, payAmount, type Wallet } from "@nabi/shared/honey.ts";
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useState } from "react";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, cx, Input } from "@/shared/ui";
import { IdentityForm } from "./IdentityForm";
import { NoticeDialog } from "./NoticeDialog";

const won = (n: number) => n.toLocaleString("ko-KR");

/** 충전하고 함께 처리할 후원. 채팅 후원 또는 미션 후원이다(4-8). */
export type PendingDonation =
  | { kind: "chat"; broadcastId: string; requestId: string; amount: number; message: string; anonymous: boolean }
  | { kind: "mission"; broadcastId: string; requestId: string; amount: number; content: string; limitMinutes: number; anonymous: boolean };

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
  const [custom, setCustom] = useState(false);
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
        ...(donation?.kind === "chat" && {
          broadcastId: donation.broadcastId,
          donation: { requestId: donation.requestId, amount: donation.amount, message: donation.message, anonymous: donation.anonymous },
        }),
        ...(donation?.kind === "mission" && {
          broadcastId: donation.broadcastId,
          mission: { requestId: donation.requestId, amount: donation.amount, content: donation.content, limitMinutes: donation.limitMinutes, anonymous: donation.anonymous },
        }),
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

  const chip = (on: boolean) => cx("h-8 rounded-full px-3 text-caption-12 disabled:cursor-not-allowed disabled:opacity-40", on ? "bg-accent text-accent-ink" : "border border-line bg-raised text-muted hover:bg-hover");
  const pay_ = valid ? payAmount(honey) : 0;
  const donated = donation?.amount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {donation && (
        <div className="flex flex-col gap-2 rounded-md bg-raised p-4 text-body-16">
          <div className="flex justify-between"><span className="text-muted">후원할 꿀</span><span className="text-number-16">{won(donated)}꿀</span></div>
          <div className="flex justify-between"><span className="text-muted">내 꿀</span><span className="text-number-16">{won(wallet.balance)}꿀</span></div>
          <div className="flex justify-between"><span className="text-muted">모자란 꿀</span><span className="text-number-16 text-danger">{won(Math.max(0, donated - wallet.balance))}꿀</span></div>
        </div>
      )}
      <p className="text-heading-16">충전할 꿀</p>
      <div className="flex flex-wrap gap-2">
        {CHARGE_UNITS.map((u) => (
          <button key={u} type="button" disabled={u > wallet.todayRemaining} onClick={() => { setHoney(u); setCustom(false); }} className={chip(!custom && honey === u)}>
            {won(u)}
          </button>
        ))}
        <button type="button" onClick={() => setCustom(true)} className={chip(custom)}>직접 입력</button>
      </div>
      {custom && (
        <label className="flex flex-col gap-2">
          <span className="text-caption-12 text-muted">충전할 꿀 (1,000꿀 단위)</span>
          <Input inputMode="numeric" value={honey ? won(honey) : ""} invalid={honey > 0 && (!valid || overLimit)} onChange={(e) => setHoney(Number(e.target.value.replace(/\D/g, "")))} />
        </label>
      )}
      <div className="flex flex-col gap-2 rounded-md border border-line p-4 text-body-16">
        <div className="flex justify-between"><span className="text-muted">충전 {valid ? won(honey) : "-"}꿀</span><span className="text-number-16">{valid ? won(honey) : "-"}원</span></div>
        <div className="flex justify-between"><span className="text-muted">부가가치세 10%</span><span className="text-number-16">{valid ? won(pay_ - honey) : "-"}원</span></div>
        <div className="flex items-center justify-between"><span>결제 금액</span><span className="text-heading-20 text-live-ink">{valid ? won(pay_) : "-"}원</span></div>
      </div>
      <p className="text-caption-12 text-subtle">오늘 남은 충전 한도는 {won(wallet.todayRemaining)}꿀이에요</p>
      {donation && valid && <p className="text-caption-12 text-muted">결제가 끝나면 {won(donated)}꿀이 바로 후원되고, 남은 {won(Math.max(0, wallet.balance + honey - donated))}꿀은 내 꿀에 남아요</p>}
      {valid && overLimit && <p className="text-caption-12 text-danger">남은 한도를 넘었어요</p>}
      {blockedAdult && <p className="text-caption-12 text-danger">만 19세 이상만 꿀을 충전할 수 있어요</p>}
      {error && <p className="text-caption-12 text-danger">{error}</p>}
      <Button size="lg" loading={busy} disabled={!valid || overLimit || blockedAdult} onClick={wallet.verified ? pay : () => setNeedVerify(true)}>
        {wallet.verified ? (valid ? `${won(pay_)}원 ${submitLabel === "충전하기" ? "결제하기" : "결제하고 후원하기"}` : submitLabel) : "본인인증하고 충전하기"}
      </Button>
      <p className="text-caption-12 text-subtle">테스트 결제라 실제 돈이 나가지 않아요</p>
      <p className="flex items-center justify-between text-caption-12 text-subtle">
        꿀 충전과 후원 유의사항에 동의합니다
        <button type="button" onClick={() => setShowNotice(true)} className="text-muted underline">안내 보기</button>
      </p>
      {showNotice && <NoticeDialog onClose={() => setShowNotice(false)} />}
    </div>
  );
}
