"use client";
import { moderationApi, SANCTION_LABEL, SANCTION_STATUS_LABEL, type SanctionItem } from "@nabi/shared/moderation.ts";
import { useEffect, useState } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Center } from "@/shared/ui";

// 조회만 한다. 이의 제기는 이번에 만들지 않는다.
export default function MySanctionsPage() {
  const { me } = useRequireLogin();
  const [items, setItems] = useState<SanctionItem[] | null>(null);
  useEffect(() => {
    if (me) void apiFetch(moderationApi.mySanctions).then((r) => setItems(r.items), () => setItems([]));
  }, [me]);

  if (!me || !items) return <Center><p className="text-muted">불러오는 중…</p></Center>;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-8">
      <h1 className="text-xl font-bold">제재 내역</h1>
      {items.length === 0 && <p className="text-sm text-muted">받은 제재가 없어요</p>}
      {items.map((s) => (
        <div key={s.id} className="flex flex-col gap-1 rounded-lg border border-line px-3 py-2.5 text-sm">
          <span className="flex justify-between">
            <b>{SANCTION_LABEL[s.kind]}</b>
            <span className={s.status === "active" ? "font-semibold text-danger" : "text-muted"}>{SANCTION_STATUS_LABEL[s.status]}</span>
          </span>
          <span className="text-muted">사유: {s.reason}</span>
          <span className="text-xs text-muted">
            {formatTime(s.startAt)}
            {s.endAt && ` ~ ${formatTime(s.endAt)}`}
          </span>
          {s.revokeReason && <span className="text-xs text-muted">해제 사유: {s.revokeReason}</span>}
        </div>
      ))}
    </div>
  );
}
