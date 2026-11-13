"use client";
import { LIVEKIT_FREE_RECORDING_MS } from "@nabi/shared/moderation.ts";
import Link from "next/link";
import { buttonCls, StatCard } from "@/shared/ui";
import { AdminGate, useAdmin } from "@/features/admin/AdminGate";

const minutes = (ms: number) => `${Math.round(ms / 60_000).toLocaleString("ko-KR")}분`;

function AdminDashboardBody() {
  const d = useAdmin();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-heading-28">대시보드</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard label="오늘 방송" value={`${d.broadcastsToday}개`} sub={`지금 방송 중 ${d.liveNow}개`} />
        <StatCard label="오늘 후원 합계" value={`${d.donationToday.toLocaleString("ko-KR")}꿀`} sub={`나비 몫 ${d.nabiShareToday.toLocaleString("ko-KR")}꿀`} />
        <Todo label="처리할 신고" count={d.pendingReports} href="/admin/reports" action="신고 처리로" />
        <Todo label="처리할 이의 제기" count={d.pendingAppeals} href="/admin/appeals" action="이의 제기로" />
        <Todo label="처리할 환급 신청" count={d.pendingRefunds} href="/admin/refunds" action="환급 관리로" />
        <StatCard label="이번 달 녹화한 시간" value={minutes(d.recordedMsThisMonth)} sub={`무료 ${minutes(LIVEKIT_FREE_RECORDING_MS)} 중`} />
        <StatCard label="이번 달 방송한 시간" value={minutes(d.broadcastMsThisMonth)} sub="LiveKit 참가자·분은 이보다 많아요" />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-caption-12 text-subtle">정확한 사용량은 각 서비스 관리 화면에서 확인해 주세요</p>
        <div className="flex gap-2">
          <a href="https://cloud.livekit.io" target="_blank" rel="noreferrer" className={buttonCls({ variant: "secondary", size: "sm" })}>
            LiveKit 관리 화면
          </a>
          <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className={buttonCls({ variant: "secondary", size: "sm" })}>
            Firebase 관리 화면
          </a>
        </div>
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
