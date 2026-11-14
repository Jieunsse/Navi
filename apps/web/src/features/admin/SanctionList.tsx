"use client";
import { moderationApi, SANCTION_LABEL, SANCTION_STATUS_LABEL, type SanctionItem } from "@nabi/shared/moderation.ts";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, Input } from "@/shared/ui";

/** 제재 이력 표. 적용 중인 제재는 사유를 적고 해제할 수 있다. */
export function SanctionList({ items, onDone, empty = "제재 이력이 없어요" }: { items: (SanctionItem & { userNickname?: string })[]; onDone: () => void; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (!items.length) return <p className="text-body-16 text-muted">{empty}</p>;
  const withUser = items.some((s) => s.userNickname);

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
    <div className="overflow-x-auto rounded-lg bg-surface text-body-16">
      <table className="w-full min-w-[56rem] text-left">
        <thead className="text-caption-12 text-subtle">
          <tr>
            {withUser && <th className="px-3 py-2 font-medium">대상</th>}
            <th className="px-3 py-2 font-medium">종류</th>
            <th className="px-3 py-2 font-medium">사유</th>
            <th className="px-3 py-2 font-medium">기간</th>
            <th className="px-3 py-2 font-medium">상태</th>
            <th className="px-3 py-2 font-medium">해제</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((s) => (
            <tr key={s.id} className="align-top">
              {withUser && <td className="whitespace-nowrap px-3 py-2 font-bold">{s.userNickname}</td>}
              <td className="whitespace-nowrap px-3 py-2">{SANCTION_LABEL[s.kind]}</td>
              <td className="px-3 py-2 text-muted">
                {s.reason}
                {s.revokeReason && <span className="block text-caption-12 text-subtle">해제 사유: {s.revokeReason}</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-caption-12 text-subtle">
                {formatTime(s.startAt)}
                {s.endAt && <span className="block">~ {formatTime(s.endAt)}</span>}
              </td>
              <td className={`whitespace-nowrap px-3 py-2 ${s.status === "active" ? "text-danger" : "text-muted"}`}>{SANCTION_STATUS_LABEL[s.status]}</td>
              <td className="px-3 py-2">
                {s.status === "active" &&
                  (open === s.id ? (
                    <div className="flex gap-2">
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="해제 사유 (필수)" aria-label="해제 사유" className="h-9 min-w-40" />
                      <Button variant="secondary" disabled={!reason.trim()} onClick={() => void revoke(s.id)} className="h-9 shrink-0">
                        해제
                      </Button>
                    </div>
                  ) : (
                    <button onClick={() => setOpen(s.id)} className="whitespace-nowrap text-caption-12 text-text underline">
                      해제하기
                    </button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
