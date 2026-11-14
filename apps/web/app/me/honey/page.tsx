"use client";
import { honeyApi, LEDGER_LABEL, REFUND_MIN, REFUND_STATUS_LABEL, type Wallet } from "@nabi/shared/honey.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRequireLogin } from "@/entities/session/session";
import { ChargeBox } from "@/features/donation/ChargeBox";
import { RefundForm } from "@/features/donation/RefundForm";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, EmptyState, Spinner, StatCard, Tabs } from "@/shared/ui";

const won = (n: number) => n.toLocaleString("ko-KR");
const statusLabel = { pending: "결제 대기", done: "완료", failed: "실패", canceling: "취소 중", canceled: "취소" } as const;

export default function MyHoneyPage() {
  const { me } = useRequireLogin();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [tab, setTab] = useState<"charges" | "refunds" | "ledger">("charges");
  const chargeRef = useRef<HTMLElement>(null);
  const reload = useCallback(async () => setWallet(await apiFetch(honeyApi.wallet).catch(() => null)), []);
  useEffect(() => {
    if (me) void apiFetch(honeyApi.wallet).then(setWallet, () => undefined);
  }, [me]);

  // 사이드바의 "꿀 충전"은 ?charge=1로 온다. 충전 창은 늘 펼쳐져 있으니 그 칸으로 스크롤한다.
  const ready = !!me && !!wallet;
  useEffect(() => {
    if (ready && new URLSearchParams(location.search).get("charge") === "1") chargeRef.current?.scrollIntoView({ block: "start" });
  }, [ready]);

  if (!me || !wallet) return <div className="grid flex-1 place-items-center"><Spinner /></div>;

  async function cancel(id: string, honey: number) {
    if (!confirm(`${won(honey)}꿀 충전을 취소할까요? 결제 금액을 돌려받고 꿀은 사라져요.`)) return;
    setCancelling(id);
    try {
      const r = await apiFetch(honeyApi.cancelCharge, undefined, { id });
      toast.success(r.status === "canceled" ? "충전을 취소했어요" : "취소를 확인하는 중이에요. 잠시 뒤에 다시 확인해 주세요");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setCancelling(null);
      await reload();
    }
  }

  const rf = wallet.refund;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:p-8">
      <h1 className="text-heading-28">내 꿀</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="쓸 수 있는 꿀" value={`${won(wallet.balance)}꿀`} />
        <StatCard label="미션에 묶인 꿀" value={`${won(wallet.pendingMission)}꿀`} />
        <StatCard label="환급 대기 중인 꿀" value={`${won(wallet.pendingRefund)}꿀`} />
      </div>

      <section ref={chargeRef} className="flex scroll-mt-4 flex-col gap-4">
        <h2 className="text-heading-16">꿀 충전</h2>
        <ChargeBox wallet={wallet} reload={reload} returnTo="/me/honey" />
      </section>

      <Tabs label="내 꿀" value={tab} onChange={setTab} items={[{ value: "charges", label: "충전 내역" }, { value: "refunds", label: "환급 신청" }, { value: "ledger", label: "사용 내역" }]} />

      {tab === "charges" && (
        <ul className="flex flex-col gap-2">
          {wallet.charges.length === 0 && <EmptyState title="충전 내역이 없어요" />}
          {wallet.charges.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-lg bg-surface p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-heading-16">{won(c.honey)}꿀</p>
                <p className="text-caption-12 text-subtle">
                  {formatTime(c.createdAt)} · 결제 {won(c.amount)}원 · {statusLabel[c.status]}
                  {c.status === "canceling" && " · 취소 결과를 확인하는 중이에요. 이 꿀은 지금 쓸 수 없어요"}
                </p>
              </div>
              {c.status === "done" && (
                <div className="flex items-center gap-3">
                  <span className={c.cancelable ? "text-caption-12 text-success" : "text-caption-12 text-subtle"}>
                    {c.cancelable ? `취소할 수 있음 · ${formatTime(c.cancelableUntil)}까지` : `취소할 수 없음${c.cancelBlockedReason ? ` · ${c.cancelBlockedReason}` : ""}`}
                  </span>
                  {c.cancelable && (
                    <Button variant="secondary" size="sm" loading={cancelling === c.id} disabled={!!cancelling} onClick={() => void cancel(c.id, c.honey)}>
                      충전 취소
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === "refunds" && (
        <section className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="환급할 수 있는 꿀" value={`${won(rf.refundable)}꿀`} />
            <StatCard label="결제 금액 기준" value={`${won(rf.base)}원`} />
            <StatCard label="수수료 10%" value={`-${won(rf.fee)}원`} />
            <StatCard label="받을 금액" value={`${won(rf.payout)}원`} />
          </div>
          <div className="flex flex-col gap-1 text-caption-12 text-subtle">
            {rf.cancelableHoney > 0 && <p>{won(rf.cancelableHoney)}꿀은 충전 취소로 전액 돌려받을 수 있어요. 환급할 수 있는 꿀에는 들어 있지 않아요</p>}
            {rf.refundable < REFUND_MIN && <p>환급은 {won(REFUND_MIN)}꿀부터 신청할 수 있어요</p>}
            {!wallet.verified && <p>환급은 본인인증을 마친 사람만 신청할 수 있어요</p>}
            {wallet.refunds.some((x) => x.status === "pending" || x.status === "sending" || x.status === "failed") && <p>처리 중인 환급 신청이 있어요. 끝난 뒤에 다시 신청할 수 있어요</p>}
          </div>
          {refundOpen ? (
            <RefundForm wallet={wallet} onClose={() => setRefundOpen(false)} onDone={async () => { setRefundOpen(false); toast.success("환급을 신청했어요"); await reload(); }} />
          ) : (
            <Button variant="primary" className="self-start" disabled={!rf.canApply} onClick={() => setRefundOpen(true)}>환급 신청</Button>
          )}
          <ul className="flex flex-col gap-2">
            {wallet.refunds.map((x) => (
              <li key={x.id} className="flex flex-col gap-1 rounded-lg bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-heading-16">{won(x.honey)}꿀 → {won(x.payout)}원</p>
                  <span className="text-caption-12 text-muted">{REFUND_STATUS_LABEL[x.status]}</span>
                </div>
                <p className="text-caption-12 text-subtle">{formatTime(x.createdAt)} · {x.bank} ****{x.last4}{x.rejectReason && ` · 거절 사유: ${x.rejectReason}`}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "ledger" && (
        <ul className="flex flex-col gap-2">
          {wallet.ledger.length === 0 && <EmptyState title="꿀 내역이 없어요" />}
          {wallet.ledger.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-4">
              <div className="flex flex-col gap-1">
                <p className="text-heading-16">{LEDGER_LABEL[l.type] ?? l.type}</p>
                <p className="text-caption-12 text-subtle">{formatTime(l.createdAt)}</p>
              </div>
              <b className={l.amount > 0 ? "text-number-16 text-success" : "text-number-16"}>{l.amount > 0 ? "+" : ""}{won(l.amount)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
