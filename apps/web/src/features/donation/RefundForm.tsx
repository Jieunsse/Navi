"use client";
import { honeyApi, type Wallet } from "@nabi/shared/honey.ts";
import { useState } from "react";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, Field, Input, Notice } from "@/shared/ui";

const won = (n: number) => n.toLocaleString("ko-KR");

/** 환급 신청 창(4-8). 계좌는 목업이라 실제로 확인하지 않는다. 예금주는 본인인증 이름으로 채운다. */
export function RefundForm({ wallet, onClose, onDone }: { wallet: Wallet; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [bank, setBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  // 신청 번호는 창을 열 때 한 번 만든다. 버튼을 두 번 눌러도 서버가 한 번만 신청한다.
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const r = wallet.refund;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(honeyApi.requestRefund, { requestId, bank, accountNumber });
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      <Notice tone="warn">테스트라 계좌를 실제로 확인하지 않고 돈도 보내지 않아요</Notice>
      <p className="text-body-16">{won(r.refundable)}꿀을 환급하고 <b>{won(r.payout)}원</b>을 받아요. 신청하면 이 꿀은 후원에 쓸 수 없어요.</p>
      <Field label="은행"><Input value={bank} onChange={(e) => setBank(e.target.value)} maxLength={20} /></Field>
      <Field label="계좌번호" hint="숫자만 입력해 주세요. 끝 4자리만 저장해요"><Input value={accountNumber} inputMode="numeric" maxLength={20} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="예금주" hint="본인인증한 이름이에요"><Input value={wallet.identityName ?? ""} readOnly /></Field>
      {error && <p className="text-caption-12 text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>닫기</Button>
        <Button variant="primary" className="flex-1" loading={busy} disabled={!bank.trim() || accountNumber.length < 6} onClick={submit}>환급 신청하기</Button>
      </div>
    </div>
  );
}
