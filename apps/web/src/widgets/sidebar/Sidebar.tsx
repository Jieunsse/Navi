"use client";
import { honeyApi } from "@nabi/shared/honey.ts";
import { CATEGORIES } from "@nabi/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useHomeBroadcasts } from "@/entities/broadcast/model";
import { loginHref, useSession } from "@/entities/session/session";
import { apiFetch } from "@/shared/api/apiFetch";
import { useStored } from "@/shared/lib/stored";
import { Avatar, cx, HistoryIcon, HoneyIcon, IconButton, RadioIcon, RefreshIcon, ThemeToggle, VideoIcon } from "@/shared/ui";
import { CategoryIcon } from "../home/category";

export const SIDEBAR_KEY = "nabi-sidebar";
/** PC에서 사이드바를 열어 두었는지. 저장한 값이 없으면 열림. */
export const usePcSidebar = () => {
  const [v, set] = useStored(SIDEBAR_KEY, "open");
  return [v !== "closed", (open: boolean) => set(open ? "open" : "closed")] as const;
};

export const menus = [
  { href: "/", label: "전체 방송", icon: RadioIcon },
  { href: "/replays", label: "다시보기", icon: HistoryIcon },
];

/** PC(md 이상)에서 왼쪽에 붙어 있는 사이드바. 열리면 오른쪽 콘텐츠가 밀려난다. */
export function SidebarDock() {
  const path = usePathname();
  const [open] = usePcSidebar();
  if (path.startsWith("/admin")) return null; // 운영자 화면에는 공통 헤더·사이드바를 두지 않는다(4-16)
  return (
    <aside
      aria-label="사이드바"
      className={cx("sticky top-[var(--size-header)] hidden h-[calc(100dvh-var(--size-header))] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-base p-2 md:flex", open ? "w-[240px]" : "w-[72px]")}
    >
      <SidebarBody path={path} collapsed={!open} />
    </aside>
  );
}

export function SidebarBody({ path, collapsed = false, mobile = false }: { path: string; collapsed?: boolean; mobile?: boolean }) {
  const { live, ready, refreshing, refresh } = useHomeBroadcasts();
  const { me } = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (mobile && me) void apiFetch(honeyApi.wallet).then((w) => setBalance(w.balance), () => undefined); // 휴대폰 사이드바의 잔액 표시(4-16)
  }, [me, mobile]);

  const all = [...(live ?? []), ...(ready ?? [])];
  const cats = CATEGORIES.map((c) => ({ id: c.id, n: all.filter((b) => b.category === c.id).length })).sort((a, b) => b.n - a.n); // 방송 수가 많은 순, 같으면 목록 순서
  const chargeHref = me ? "/me/honey?charge=1" : loginHref("/me/honey?charge=1");

  return (
    <>
      {mobile && (
        <div className="flex flex-col gap-1 border-b border-line pb-2">
          {me && (
            <>
              <SideLink href="/studio" icon={<VideoIcon />} label="스튜디오" />
              <SideLink href="/me/honey" icon={<HoneyIcon />} label={balance === null ? "내 꿀" : `내 꿀 ${balance.toLocaleString("ko-KR")}`} />
            </>
          )}
          <ThemeToggle withLabel />
        </div>
      )}
      <nav className="flex flex-col gap-1 border-b border-line pb-2">
        {menus.map((m) => (
          <SideLink key={m.href} href={m.href} icon={<m.icon />} label={m.label} active={path === m.href} collapsed={collapsed} />
        ))}
      </nav>
      <section className="flex flex-col gap-1 border-b border-line pb-2">
        {!collapsed && (
          <div className="flex items-center justify-between">
            <h2 className="px-3 py-1 text-caption-12 text-subtle">인기 카테고리</h2>
            <RefreshButton label="인기 카테고리 새로고침" refreshing={refreshing} onClick={refresh} />
          </div>
        )}
        {cats.map((c) => (
          <Link key={c.id} href={`/?category=${encodeURIComponent(c.id)}#category`} title={collapsed ? c.id : undefined} aria-label={collapsed ? c.id : undefined} className={cx("flex h-10 items-center gap-3 rounded-md px-3 text-body-16 text-muted hover:bg-hover hover:text-text", collapsed && "justify-center px-0")}>
            <CategoryIcon id={c.id} size={20} />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate">{c.id}</span>
                <span className="text-caption-12 text-subtle">{c.n}</span>
              </>
            )}
          </Link>
        ))}
      </section>
      {!collapsed && (
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h2 className="px-3 py-1 text-caption-12 text-subtle">지금 방송 중</h2>
            <RefreshButton label="지금 방송 중 새로고침" refreshing={refreshing} onClick={refresh} />
          </div>
          {live?.length ? (
            live.slice(0, 5).map((b) => (
              <Link key={b.id} href={`/live/${b.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-hover">
                <Avatar name={b.ownerNickname} live />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="min-w-0 truncate text-body-16">{b.ownerNickname}</span>
                  </span>
                  <span className="block truncate text-caption-12 text-muted">{b.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-caption-12 text-muted">
                  <span className="size-2 rounded-full bg-live" aria-hidden />
                  {b.viewerCount.toLocaleString("ko-KR")}명
                </span>
              </Link>
            ))
          ) : (
            <p className="px-3 text-caption-12 text-subtle">지금 방송 중인 사람이 없어요</p>
          )}
          <Link href="/" className="mt-1 rounded-md px-3 py-2 text-caption-12 hover:bg-hover">
            더보기
          </Link>
        </section>
      )}
      {/* 누르면 내 꿀의 충전 창을 연다. 내 꿀 화면이 charge=1을 읽어 연다. 비로그인이면 로그인을 거쳐 온다. */}
      {collapsed ? (
        <Link href={chargeHref} aria-label="꿀 충전" title="꿀 충전" className="mt-auto grid h-10 place-items-center rounded-md hover:bg-hover">
          <HoneyIcon />
        </Link>
      ) : (
        <Link href={chargeHref} className="mt-auto flex flex-col gap-1 rounded-md bg-surface p-3 hover:bg-hover">
          <span className="flex items-center gap-2 text-heading-16">
            <HoneyIcon /> 꿀 충전
          </span>
          <span className="text-caption-12 text-muted">충전한 꿀로 준비 중이거나 방송 중인 방송자에게 후원할 수 있어요</span>
        </Link>
      )}
    </>
  );
}

/** 제목 옆 새로고침 버튼. 받는 동안 아이콘이 돈다. */
function RefreshButton({ label, refreshing, onClick }: { label: string; refreshing: boolean; onClick: () => void }) {
  return (
    <IconButton label={label} title={label} onClick={onClick} disabled={refreshing} aria-busy={refreshing} className="size-8 text-subtle">
      <RefreshIcon size={16} className={refreshing ? "animate-spin" : undefined} />
    </IconButton>
  );
}

function SideLink({ href, icon, label, active, collapsed }: { href: string; icon: ReactNode; label: string; active?: boolean; collapsed?: boolean }) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cx("flex h-12 items-center gap-3 rounded-md px-3 text-body-16", collapsed && "justify-center px-0", active ? "bg-selected text-text" : "text-muted hover:bg-hover hover:text-text")}
    >
      {icon}
      {!collapsed && label}
    </Link>
  );
}
