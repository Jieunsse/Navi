"use client";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { useEffect, useState } from "react";
import type { ApiRes } from "@nabi/shared";
import { AdminGate } from "@/features/admin/AdminGate";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";

// 운영 기록은 읽기만 한다. 고치거나 지우는 길이 서버에도 없다.
function AdminLogsPageBody() {
  const [items, setItems] = useState<ApiRes<typeof moderationApi.adminLogs>["items"] | null>(null);
  useEffect(() => {
    void apiFetch(moderationApi.adminLogs).then((r) => setItems(r.items), () => setItems([]));
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">운영 기록</h1>
      {items?.length === 0 && <p className="text-sm text-muted">기록이 없어요</p>}
      <div className="flex flex-col gap-2">
        {items?.map((l) => (
          <div key={l.id} className="rounded-lg border border-line px-3 py-2 text-sm">
            <p>
              <b>{l.action}</b> · {l.targetLabel}
            </p>
            <p className="text-xs text-muted">
              {l.adminNickname} · {formatTime(l.createdAt)} · {l.before} → {l.after}
              {l.reason && ` · 사유: ${l.reason}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// 운영자 틀은 layout.tsx 대신 각 화면이 둘러싼다. 레이아웃이 둘 이상이면 Next 개발 서버가 만드는 타입 파일이 타입 검사를 깨뜨린다.
export default function AdminLogsPage() {
  return (
    <AdminGate>
      <AdminLogsPageBody />
    </AdminGate>
  );
}
