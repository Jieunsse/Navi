"use client";
import { moderationApi, REPORT_REASONS, REPORT_STATUS_LABEL, type MyReport } from "@nabi/shared/moderation.ts";
import { useEffect, useState } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Center } from "@/shared/ui";

export default function MyReportsPage() {
  const { me } = useRequireLogin();
  const [items, setItems] = useState<MyReport[] | null>(null);
  useEffect(() => {
    if (me) void apiFetch(moderationApi.myReports).then((r) => setItems(r.items), () => setItems([]));
  }, [me]);

  if (!me || !items) return <Center><p className="text-muted">불러오는 중…</p></Center>;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-8">
      <h1 className="text-xl font-bold">내 신고 내역</h1>
      {items.length === 0 && <p className="text-sm text-muted">신고한 내역이 없어요</p>}
      {items.map((r) => (
        <div key={r.id} className="flex flex-col gap-1 rounded-lg border border-line px-3 py-2.5 text-sm">
          <span className="break-words">{r.label}</span>
          <span className="flex justify-between text-xs text-muted">
            <span>
              {REPORT_REASONS[r.reason]} · {formatTime(r.createdAt)}
            </span>
            <b className={r.status === "pending" ? "" : "text-accent"}>{REPORT_STATUS_LABEL[r.status]}</b>
          </span>
        </div>
      ))}
    </div>
  );
}
