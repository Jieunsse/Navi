"use client";
import { moderationApi, SANCTION_LABEL, SANCTION_STATUS_LABEL, type SanctionItem } from "@nabi/shared/moderation.ts";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, Input } from "@/shared/ui";

/** 제재 이력. 적용 중인 제재는 사유를 적고 해제할 수 있다. */
export function SanctionList({ items, onDone }: { items: SanctionItem[]; onDone: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (!items.length) return <p className="text-body-16 text-muted">제재 이력이 없어요</p>;

  async function revoke(id: string) {
    try {
      await apiFetch(moderationApi.adminRevoke, { reason }, { id });
      toast.success("제재를 풀었어요");
      setOpen(null);
      setReason("");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((s) => (
        <div key={s.id} className="flex flex-col gap-1 rounded-lg bg-surface p-4 text-body-16">
          <span className="flex justify-between">
            <b>{SANCTION_LABEL[s.kind]}</b>
            <span className={s.status === "active" ? "text-danger" : "text-muted"}>{SANCTION_STATUS_LABEL[s.status]}</span>
          </span>
          <span className="text-muted">{s.reason}</span>
          <span className="text-caption-12 text-subtle">
            {formatTime(s.startAt)}
            {s.endAt && ` ~ ${formatTime(s.endAt)}`}
            {s.revokeReason && ` · 해제 사유: ${s.revokeReason}`}
          </span>
          {s.status === "active" &&
            (open === s.id ? (
              <div className="mt-1 flex gap-2">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="해제 사유 (필수)" aria-label="해제 사유" className="h-9" />
                <Button variant="secondary" disabled={!reason.trim()} onClick={() => revoke(s.id)} className="h-9 shrink-0">
                  해제
                </Button>
              </div>
            ) : (
              <button onClick={() => setOpen(s.id)} className="w-fit text-caption-12 text-text underline">
                해제하기
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
