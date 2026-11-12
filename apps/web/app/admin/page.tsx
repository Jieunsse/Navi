"use client";
import { AdminGate, useAdmin } from "@/features/admin/AdminGate";

function AdminDashboardBody() {
  const d = useAdmin();
  const cards = [
    ["오늘 만든 방송", d.broadcastsToday],
    ["지금 방송 중", d.liveNow],
    ["오늘 후원 합계(꿀)", d.donationToday.toLocaleString()],
    ["처리할 신고", d.pendingReports],
  ] as const;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">대시보드</h1>
      <div className="grid max-w-3xl grid-cols-4 gap-3">
        {cards.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
            <span className="text-xs text-muted">{label}</span>
            <span className="text-2xl font-black">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 운영자 틀은 layout.tsx 대신 각 화면이 둘러싼다. 레이아웃이 둘 이상이면 Next 개발 서버가 만드는 타입 파일이 타입 검사를 깨뜨린다.
export default function AdminDashboard() {
  return (
    <AdminGate>
      <AdminDashboardBody />
    </AdminGate>
  );
}
