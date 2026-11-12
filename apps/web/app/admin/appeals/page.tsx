"use client";
import { adminOpsApi, APPEAL_STATUS_LABEL, type AdminAppeal } from "@nabi/shared/adminOps.ts";
import { SANCTION_LABEL } from "@nabi/shared/moderation.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/features/admin/AdminGate";
import { Card, Chip, fail, PageHead } from "@/features/admin/adminUi";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, EmptyState, Input } from "@/shared/ui";

function Row({ a, onChanged }: { a: AdminAppeal; onChanged: () => void }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = a.status === "pending";

  async function resolve(accept: boolean) {
    setBusy(true);
    try {
      await apiFetch(adminOpsApi.resolveAppeal, { accept, answer }, { id: a.id });
      toast.success(accept ? "받아들이고 제재를 취소했어요" : "거절했어요");
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card dim={!pending}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-heading-16">
          {a.userNickname} · {SANCTION_LABEL[a.sanctionKind]}
        </p>
        <Chip>{APPEAL_STATUS_LABEL[a.status]}</Chip>
      </div>
      <p className="text-caption-12 text-muted">받은 제재 사유: {a.sanctionReason}</p>
      <p className="whitespace-pre-wrap text-body-16">{a.content}</p>
      <p className="text-caption-12 text-subtle">{formatTime(a.createdAt)} 제기</p>
      {!pending && a.answer && <p className="text-caption-12 text-muted">답변: {a.answer}</p>}
      {pending && (
        <div className="flex gap-2">
          <Input value={answer} maxLength={200} placeholder="답변 (거절할 때는 꼭 적어 주세요)" onChange={(e) => setAnswer(e.target.value)} />
          <Button className="shrink-0" loading={busy} onClick={() => void resolve(true)}>받아들임</Button>
          <Button variant="danger" className="shrink-0" disabled={busy || !answer.trim()} onClick={() => void resolve(false)}>거절</Button>
        </div>
      )}
    </Card>
  );
}

function Body() {
  const [items, setItems] = useState<AdminAppeal[] | null>(null);
  const load = useCallback(() => apiFetch(adminOpsApi.adminAppeals).then((r) => setItems(r.items), () => setItems([])), []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="이의 제기" desc="받아들이면 제재를 바로 풀어요. 거절하면 답변이 제재 내역에 보여요." />
      {items?.length === 0 && <EmptyState title="이의 제기가 없어요" />}
      <div className="flex flex-col gap-2">{items?.map((a) => <Row key={a.id} a={a} onChanged={() => void load()} />)}</div>
    </div>
  );
}

export default function AdminAppealsPage() {
  return (
    <AdminGate>
      <Body />
    </AdminGate>
  );
}
