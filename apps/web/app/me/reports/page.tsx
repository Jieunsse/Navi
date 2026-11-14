"use client";
import { moderationApi, REPORT_REASONS, REPORT_STATUS_LABEL, type MyReport } from "@nabi/shared/moderation.ts";
import { useEffect, useState } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { EmptyState, Spinner } from "@/shared/ui";

export default function MyReportsPage() {
  const { me } = useRequireLogin();
  const [items, setItems] = useState<MyReport[] | null>(null);
  useEffect(() => {
    if (me) void apiFetch(moderationApi.myReports).then((r) => setItems(r.items), () => setItems([]));
  }, [me]);

  if (!me || !items) return <div className="grid flex-1 place-items-center"><Spinner /></div>;
  const tone = { pending: "text-live-ink", actioned: "text-success", dismissed: "text-subtle" } as Record<string, string>;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:p-8">
      <h1 className="text-heading-28">내 신고 내역</h1>
      {items.length === 0 && <EmptyState title="신고한 내역이 없어요" />}
      <ul className="flex flex-col gap-2">
        {items.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 rounded-lg bg-surface p-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="break-words text-heading-16">{r.label}</p>
              <p className="text-caption-12 text-subtle">
                {REPORT_REASONS[r.reason]} · {formatTime(r.createdAt)}
              </p>
            </div>
            <span className={`shrink-0 text-body-16 ${tone[r.status] ?? "text-muted"}`}>{REPORT_STATUS_LABEL[r.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
