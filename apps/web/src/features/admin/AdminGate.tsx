"use client";
import type { ApiRes } from "@nabi/shared";
import { moderationApi } from "@nabi/shared/moderation.ts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { cx } from "@/shared/ui";

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
  { href: "/admin/logs", label: "운영 기록" },
];

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
      <p className="p-8 text-center text-sm text-muted lg:hidden">운영자 화면은 PC에서만 열 수 있어요</p>
      <div className="hidden min-h-screen lg:flex">
        <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-line bg-surface p-4">
          <Link href="/" className="mb-4 text-lg font-black text-accent">
            나비 운영
          </Link>
          {menus.map((m) => (
            <Link key={m.href} href={m.href} className={cx("rounded-lg px-3 py-2 text-sm font-medium", path === m.href ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2")}>
              {m.label}
            </Link>
          ))}
          {data?.isTestAdmin && <p className="mt-4 text-xs text-muted">테스트 운영자예요. 심사용 계정만 보고 조치할 수 있어요.</p>}
        </aside>
        <div className="min-w-0 flex-1 p-8">
          {denied ? <p className="text-muted">{denied}</p> : loading || !data ? <p className="text-muted">불러오는 중…</p> : <Ctx.Provider value={data}>{children}</Ctx.Provider>}
        </div>
      </div>
    </>
  );
}
