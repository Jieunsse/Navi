"use client";
import { adminOpsApi, type AdminBroadcast } from "@nabi/shared/adminOps.ts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/features/admin/AdminGate";
import { Card, fail, PageHead } from "@/features/admin/adminUi";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, EmptyState, Input, StatusBadge } from "@/shared/ui";

function Row({ b, onChanged }: { b: AdminBroadcast; onChanged: () => void }) {
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function end() {
    setBusy(true);
    try {
      await apiFetch(adminOpsApi.forceEndBroadcast, { reason }, { id: b.id });
      toast.success("방송을 끝냈어요");
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <StatusBadge status={b.status} />
          <Link href={`/live/${b.id}`} target="_blank" className="truncate text-heading-16 hover:underline">{b.title}</Link>
        </div>
        {b.status === "live" && !ending && <Button variant="danger" size="sm" onClick={() => setEnding(true)}>강제 종료</Button>}
      </div>
      <p className="text-caption-12 text-subtle">
        {b.ownerNickname} · {formatTime(b.createdAt)} 만듦{b.endedAt && ` · ${formatTime(b.endedAt)} 종료`}
      </p>
      {ending && (
        <div className="flex gap-2">
          <Input value={reason} maxLength={200} placeholder="사유 (운영 기록에 남아요)" onChange={(e) => setReason(e.target.value)} />
          <Button variant="danger" className="shrink-0" loading={busy} disabled={!reason.trim()} onClick={() => void end()}>종료하기</Button>
          <Button variant="secondary" className="shrink-0" disabled={busy} onClick={() => setEnding(false)}>닫기</Button>
        </div>
      )}
    </Card>
  );
}

function Body() {
  const [items, setItems] = useState<AdminBroadcast[] | null>(null);
  const load = useCallback(() => apiFetch(adminOpsApi.adminBroadcasts).then((r) => setItems(r.items), () => setItems([])), []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="방송 관리" desc="방송 중인 방송은 사유를 적고 강제로 끝낼 수 있어요." />
      {items?.length === 0 && <EmptyState title="방송이 없어요" />}
      <div className="flex flex-col gap-2">{items?.map((b) => <Row key={b.id} b={b} onChanged={() => void load()} />)}</div>
    </div>
  );
}

export default function AdminBroadcastsPage() {
  return (
    <AdminGate>
      <Body />
    </AdminGate>
  );
}
