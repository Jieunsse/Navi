"use client";
import type { ApiRes } from "@nabi/shared";
import { moderationApi } from "@nabi/shared/moderation.ts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { BanIcon, CalendarClockIcon, CreditCardIcon, cx, FlagIcon, HistoryIcon, LayoutGridIcon, Logo, MessageCircleOffIcon, RadioIcon, ScaleIcon, Spinner, UserIcon, UsersIcon, WalletIcon } from "@/shared/ui";

type Dashboard = ApiRes<typeof moderationApi.adminDashboard>;
const Ctx = createContext<Dashboard | null>(null);
export const useAdmin = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("AdminGate가 없어요");
  return v;
};

const menus = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/reports", label: "신고 처리" },
  { href: "/admin/users", label: "회원과 제재" },
  { href: "/admin/appeals", label: "이의 제기" },
  { href: "/admin/broadcasts", label: "방송 관리" },
  { href: "/admin/refunds", label: "환급 관리" },
  { href: "/admin/settlements", label: "정산 관리" },
  { href: "/admin/charges", label: "충전·결제 내역" },
  { href: "/admin/jobs", label: "예약 작업 기록" },
  { href: "/admin/banned-words", label: "금칙어 관리" },
  { href: "/admin/test-accounts", label: "테스트 계정" },
  { href: "/admin/logs", label: "운영 기록" },
];

// 메뉴 아이콘은 주소로 찾는다. 목록에 메뉴가 더해져도 아이콘이 없으면 사람 아이콘을 쓴다.
const menuIcon: Record<string, typeof FlagIcon> = {
  "/admin": LayoutGridIcon,
  "/admin/reports": FlagIcon,
  "/admin/users": BanIcon,
  "/admin/appeals": ScaleIcon,
  "/admin/broadcasts": RadioIcon,
  "/admin/refunds": UsersIcon,
  "/admin/settlements": WalletIcon,
  "/admin/charges": CreditCardIcon,
  "/admin/jobs": CalendarClockIcon,
  "/admin/banned-words": MessageCircleOffIcon,
  "/admin/logs": HistoryIcon,
};

/** 운영자 화면 틀. 서버가 운영자인지 확인한 뒤에만 안쪽을 보여준다(PC만, 4-15). */
export function AdminGate({ children }: { children: ReactNode }) {
  const { me, loading } = useRequireLogin();
  const path = usePathname();
  const [data, setData] = useState<Dashboard | null>(null);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    void apiFetch(moderationApi.adminDashboard).then(setData, (e) => setDenied(e instanceof ApiError && e.status === 403 ? "권한이 없어요" : "잠시 뒤에 다시 시도해 주세요"));
  }, [me, path]);

  return (
    <>
      <p className="p-8 text-center text-caption-12 text-muted lg:hidden">운영자 화면은 PC에서만 열 수 있어요</p>
      <div className="hidden min-h-screen lg:flex">
        <aside className="flex w-60 shrink-0 flex-col gap-1 bg-surface p-4">
          <Link href="/" className="mb-4 flex items-center gap-2 px-3 py-2">
            <Logo />
            <span className="text-caption-12 text-subtle">운영자</span>
          </Link>
          {menus.map((m) => {
            const MenuIcon = menuIcon[m.href] ?? UserIcon;
            const on = m.href === "/admin" ? path === m.href : path.startsWith(m.href);
            return (
              <Link key={m.href} href={m.href} aria-current={on ? "page" : undefined} className={cx("flex h-10 items-center gap-3 rounded-md px-3 text-body-16", on ? "bg-raised text-text" : "text-muted hover:bg-hover")}>
                <MenuIcon size={20} />
                {m.label}
              </Link>
            );
          })}
          {data?.isTestAdmin && <p className="mt-4 px-3 text-caption-12 text-subtle">테스트 운영자예요. 심사용 계정만 보고 조치할 수 있어요.</p>}
        </aside>
        <div className="min-w-0 flex-1 p-8">
          {denied ? <p className="text-muted">{denied}</p> : loading || !data ? <Spinner /> : <Ctx.Provider value={data}>{children}</Ctx.Provider>}
        </div>
      </div>
    </>
  );
}
