"use client";
import { adminOpsApi, type JobRun } from "@nabi/shared/adminOps.ts";
import { useEffect, useState } from "react";
import { AdminGate } from "@/features/admin/AdminGate";
import { Card, Chip, PageHead } from "@/features/admin/adminUi";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { EmptyState } from "@/shared/ui";

const MODE = { scheduled: "예약", test: "테스트" } as Record<string, string>;

function Body() {
  const [items, setItems] = useState<JobRun[] | null>(null);
  useEffect(() => {
    void apiFetch(adminOpsApi.adminJobs).then((r) => setItems(r.items), () => setItems([]));
  }, []);
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="예약 작업 기록" desc="월 정산 같은 자동 작업이 언제 돌았고 어떻게 끝났는지 보여줘요." />
      {items?.length === 0 && <EmptyState title="작업 기록이 없어요" />}
      <div className="flex flex-col gap-2">
        {items?.map((j) => (
          <Card key={j.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-heading-16">{j.jobName}</p>
              <Chip>{MODE[j.mode] ?? j.mode}</Chip>
            </div>
            <p className="text-body-16">{j.result}</p>
            <p className="text-caption-12 text-subtle">
              {formatTime(j.startedAt)} 시작 · {j.endedAt ? `${formatTime(j.endedAt)} 끝` : "끝나지 않았어요"} · 방송자 {j.streamerCount}명
              {j.adminNickname && ` · 실행 ${j.adminNickname}`}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AdminJobsPage() {
  return (
    <AdminGate>
      <Body />
    </AdminGate>
  );
}
