"use client";
import { adminRefundApi, REFUND_STATUS_LABEL, type AdminRefund } from "@nabi/shared/honey.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/features/admin/AdminGate";
import { PageHead } from "@/features/admin/adminUi";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, cx, EmptyState, Input } from "@/shared/ui";

const won = (n: number) => n.toLocaleString("ko-KR");
const KIND = { chat: "채팅", mission: "미션" } as Record<string, string>;
const CHARGE = { pending: "결제 대기", done: "완료", failed: "실패", canceling: "취소 중", canceled: "취소" } as Record<string, string>;

function Row({ r, onChanged }: { r: AdminRefund; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = r.status === "pending" || r.status === "failed"; // 송금 실패도 다시 승인하거나 거절할 수 있다

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setBusy(false);
      setRejecting(false);
      onChanged();
    }
  }

  return (
    <div className={cx("flex flex-col gap-2 rounded-lg bg-surface p-4 text-body-16", !open && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p><b>{r.nickname}</b> · 환급할 꿀 {won(r.honey)} · 받을 금액 <b>{won(r.payout)}원</b></p>
        <span className="rounded-xs bg-raised px-1.5 py-0.5 text-caption-12 text-subtle">{REFUND_STATUS_LABEL[r.status]}</span>
      </div>
      <p className="text-caption-12 text-subtle">
        결제 금액 기준 {won(r.base)}원 − 수수료 {won(r.fee)}원 · {r.masked ? "계좌를 가렸어요" : r.account} · 신청 {formatTime(r.createdAt)}
        {r.reason && ` · ${r.status === "failed" ? "송금 실패" : "사유"}: ${r.reason}`}
      </p>
      {!r.masked && (
        <div className="grid gap-1 text-caption-12 text-subtle sm:grid-cols-2">
          <p>최근 충전: {r.recentCharges.length ? r.recentCharges.map((c) => `${won(c.honey)}꿀(${CHARGE[c.status] ?? c.status})`).join(", ") : "없어요"}</p>
          <p>최근 후원: {r.recentDonations.length ? r.recentDonations.map((d) => `${won(d.amount)}꿀(${KIND[d.kind] ?? d.kind})`).join(", ") : "없어요"}</p>
        </div>
      )}
      {open && (
        rejecting ? (
          <div className="flex gap-2">
            <Input value={reason} maxLength={200} placeholder="거절 사유를 적어 주세요" onChange={(e) => setReason(e.target.value)} />
            <Button variant="danger" className="shrink-0" loading={busy} disabled={!reason.trim()} onClick={() => void run(() => apiFetch(adminRefundApi.reject, { reason }, { id: r.id }), "환급을 거절하고 꿀을 돌려줬어요")}>거절하기</Button>
            <Button variant="secondary" className="shrink-0" disabled={busy} onClick={() => setRejecting(false)}>닫기</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button loading={busy} onClick={() => void run(async () => { const x = await apiFetch(adminRefundApi.approve, undefined, { id: r.id }); if (x.status === "failed") throw new ApiError(0, "SEND_FAILED", "송금에 실패했어요. 다시 승인하거나 거절할 수 있어요"); }, "환급을 승인했어요(테스트 송금)")}>
              {r.status === "failed" ? "다시 승인" : "승인"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>거절</Button>
          </div>
        )
      )}
    </div>
  );
}

function AdminRefundsBody() {
  const [items, setItems] = useState<AdminRefund[] | null>(null);
  const load = useCallback(async () => setItems((await apiFetch(adminRefundApi.list).catch(() => ({ items: [] as AdminRefund[] }))).items), []);
  useEffect(() => {
    void apiFetch(adminRefundApi.list).then((r) => setItems(r.items), () => setItems([]));
  }, []);
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="환급 관리" desc="승인하면 송금 목업을 불러요(실제로 돈이 움직이지 않아요). 거절하면 묶어 둔 꿀을 돌려줘요." />
      {items?.length === 0 && <EmptyState title="환급 신청이 없어요" />}
      <div className="flex flex-col gap-2">{items?.map((r) => <Row key={r.id} r={r} onChanged={() => void load()} />)}</div>
    </div>
  );
}

// 운영자 틀은 layout.tsx 대신 각 화면이 둘러싼다(logs 화면과 같다).
export default function AdminRefundsPage() {
  return (
    <AdminGate>
      <AdminRefundsBody />
    </AdminGate>
  );
}
