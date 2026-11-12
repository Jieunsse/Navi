"use client";
import Link from "next/link";
import { buttonCls, StatCard } from "@/shared/ui";
import { AdminGate, useAdmin } from "@/features/admin/AdminGate";

function AdminDashboardBody() {
  const d = useAdmin();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-heading-28">대시보드</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard label="오늘 방송" value={`${d.broadcastsToday}개`} sub={`지금 방송 중 ${d.liveNow}개`} />
        <StatCard label="오늘 후원 합계" value={`${d.donationToday.toLocaleString("ko-KR")}꿀`} />
        <Todo label="처리할 신고" count={d.pendingReports} href="/admin/reports" action="신고 처리로" />
        <Todo label="처리할 이의 제기" count={d.pendingAppeals} href="/admin/appeals" action="이의 제기로" />
        <Todo label="처리할 환급 신청" count={d.pendingRefunds} href="/admin/refunds" action="환급 관리로" />
      </div>
    </div>
  );
}

// 처리할 일이 있으면 카드의 버튼으로 바로 간다.
function Todo({ label, count, href, action }: { label: string; count: number; href: string; action: string }) {
  return (
    <StatCard label={label} value={`${count}건`}>
      {count > 0 && (
        <Link href={href} className={buttonCls({ variant: "secondary", size: "sm", className: "mt-1 self-start" })}>
          {action}
        </Link>
      )}
    </StatCard>
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
