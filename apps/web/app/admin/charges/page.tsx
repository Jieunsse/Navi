"use client";
import { adminOpsApi, type AdminCharge } from "@nabi/shared/adminOps.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/features/admin/AdminGate";
import { Card, Chip, fail, PageHead } from "@/features/admin/adminUi";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, EmptyState } from "@/shared/ui";

const STATUS = { pending: "결제 대기", done: "완료", failed: "실패", canceling: "취소 중", canceled: "취소" } as const;
const RESULT = { canceled: "취소로 정리했어요", reverted: "취소가 안 돼 꿀을 되돌렸어요", canceling: "아직 결과를 알 수 없어요" } as const;
const won = (n: number) => n.toLocaleString("ko-KR");

function Body() {
  const [items, setItems] = useState<AdminCharge[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => apiFetch(adminOpsApi.adminCharges).then((r) => setItems(r.items), () => setItems([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function reconcile(id: string) {
    setBusy(id);
    try {
      toast.success(RESULT[(await apiFetch(adminOpsApi.reconcileCharge, undefined, { id })).status]);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHead title="충전·결제 내역" desc="5분 넘게 '취소 중'에 멈춘 충전은 결제사에 다시 물어서 정리할 수 있어요." />
      {items?.length === 0 && <EmptyState title="충전 내역이 없어요" />}
      <div className="flex flex-col gap-2">
        {items?.map((c) => (
          <Card key={c.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-heading-16">
                {c.userNickname} · 꿀 {won(c.honey)} ({won(c.amount)}원)
              </p>
              <Chip>{STATUS[c.status]}</Chip>
            </div>
            <p className="text-caption-12 text-subtle">
              {formatTime(c.createdAt)} 충전 · 결제 키 {c.paymentKey ?? "없음"}
              {c.cancelRequestedAt && ` · ${formatTime(c.cancelRequestedAt)} 취소 요청`}
            </p>
            {c.stuck && (
              <div>
                <Button variant="secondary" size="sm" loading={busy === c.id} onClick={() => void reconcile(c.id)}>멈춘 취소 정리</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AdminChargesPage() {
  return (
    <AdminGate>
      <Body />
    </AdminGate>
  );
}
