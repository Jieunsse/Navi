"use client";
import { GRADE_LABEL, type Grade } from "@nabi/shared/grade.ts";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loginHref, useSession } from "@/entities/session/session";
import { NotificationBell } from "@/features/notification/NotificationBell";
import { SanctionBanner } from "@/features/moderation/SanctionBanner";
import { Avatar, AwardIcon, buttonCls, cx, FlagIcon, GiftIcon, HoneyIcon, IconButton, LayoutGridIcon, Logo, LogOutIcon, MenuIcon, ThemeToggle, UserIcon, VideoIcon, BanIcon } from "@/shared/ui";
import { menus, SidebarBody, usePcSidebar } from "../sidebar/Sidebar";

export function Header() {
  const { me, loading, logout } = useSession();
  const path = usePathname();
  const router = useRouter();
  // 연 화면 주소를 기억해서, 다른 화면으로 가면 저절로 닫힌다.
  const [sideAt, setSideAt] = useState<string | null>(null);
  const [profileAt, setProfileAt] = useState<string | null>(null);
  const sideOpen = sideAt === path;
  const profileOpen = profileAt === path;
  const setSideOpen = (v: boolean) => setSideAt(v ? path : null);
  const setProfileOpen = (v: boolean) => setProfileAt(v ? path : null);
  const [pcOpen, setPcOpen] = usePcSidebar();
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const close = (e: MouseEvent) => !profileRef.current?.contains(e.target as Node) && setProfileAt(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [profileOpen]);

  if (path.startsWith("/admin")) return null; // 운영자 화면에는 공통 헤더를 두지 않는다(4-16)

  return (
    <>
      <header className="sticky top-0 z-[var(--z-header)] flex h-[var(--size-header)] items-center justify-between gap-4 border-b border-line bg-base px-4 md:px-6">
        <div className="flex items-center gap-4">
          <IconButton
            label="사이드바 열기"
            aria-expanded={pcOpen}
            onClick={() => (window.matchMedia("(min-width: 768px)").matches ? setPcOpen(!pcOpen) : setSideOpen(!sideOpen))} // PC는 왼쪽 막대를 열고 닫고, 휴대폰은 덮는 창을 연다
          >
            <MenuIcon />
          </IconButton>
          <Link href="/" aria-label="나비 홈">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {menus.map((m) => (
              <Link key={m.href} href={m.href} className={cx("text-heading-16", path === m.href ? "text-text" : "text-muted hover:text-text")}>
                {m.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {loading ? null : me ? (
            <>
              <Link href="/studio" className={buttonCls({ variant: "secondary", size: "sm", className: "hidden md:inline-flex" })}>
                <VideoIcon size={16} />
                스튜디오
              </Link>
              <Link href="/me/honey" aria-label="내 꿀" className="hidden size-10 place-items-center rounded-md hover:bg-hover md:grid">
                <HoneyIcon />
              </Link>
              <NotificationBell path={path} />
              <span className="hidden md:block">
                <ThemeToggle />
              </span>
              <div ref={profileRef} className="relative">
                <button onClick={() => setProfileOpen(!profileOpen)} aria-label="내 프로필" aria-expanded={profileOpen} className="grid size-10 place-items-center rounded-full">
                  <Avatar name={me.nickname} />
                </button>
                {profileOpen && <ProfileMenu onLogout={async () => { await logout(); router.push("/"); }} />}
              </div>
            </>
          ) : (
            <>
              <span className="hidden md:block">
                <ThemeToggle />
              </span>
              <Link href={loginHref(path)} className={buttonCls({ size: "sm" })}>
                로그인
              </Link>
            </>
          )}
        </div>
      </header>
      <SanctionBanner />
      {sideOpen && (
        <div className="fixed inset-x-0 bottom-0 top-[var(--size-header)] z-[var(--z-sheet)] md:hidden" role="dialog" aria-modal aria-label="사이드바">
          <button className="absolute inset-0 bg-scrim" onClick={() => setSideOpen(false)} aria-label="사이드바 닫기" />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-3 overflow-y-auto border-r border-line bg-base p-2">
            <SidebarBody path={path} mobile />
          </aside>
        </div>
      )}
    </>
  );
}

const itemCls = "flex h-10 items-center gap-3 rounded-md px-3 text-body-16 hover:bg-hover";

function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  const { me } = useSession();
  if (!me) return null;
  const grade = GRADE_LABEL[me.grade as Grade] ?? me.grade;
  return (
    <div className="absolute right-0 top-12 z-[var(--z-dropdown)] w-[280px] rounded-lg border border-line bg-surface p-2 shadow-overlay">
      <div className="flex items-center gap-3 border-b border-line p-3">
        <Avatar name={me.nickname} size="lg" />
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="truncate text-heading-16">{me.nickname}</span>
            <span className="shrink-0 text-caption-12 text-success">{grade}</span>
          </p>
          <p className="truncate text-caption-12 text-subtle">{me.email}</p>
        </div>
      </div>
      <p className="px-3 pb-1 pt-3 text-caption-12 text-subtle">나비</p>
      <nav className="flex flex-col">
        <Link href="/studio" className={itemCls}><VideoIcon /> 스튜디오</Link>
        <Link href="/me" className={itemCls}><UserIcon /> 내 정보</Link>
        <Link href="/me/honey" className={itemCls}><HoneyIcon /> 내 꿀</Link>
        <Link href="/me/grade" className={itemCls}><AwardIcon /> 내 등급</Link>
        <Link href="/me?tab=donations" className={itemCls}><GiftIcon /> 내 후원 내역</Link>
        <Link href="/me/reports" className={itemCls}><FlagIcon /> 내 신고 내역</Link>
        <Link href="/me/sanctions" className={itemCls}><BanIcon /> 제재 내역</Link>
      </nav>
      <div className="mt-2 flex flex-col border-t border-line pt-2">
        {me.isAdmin && (
          <Link href="/admin" className={itemCls}>
            <LayoutGridIcon /> 운영자 화면
          </Link>
        )}
        <button onClick={onLogout} className={cx(itemCls, "w-full text-left", me.isAdmin && "mt-2 border-t border-line pt-2")}>
          <LogOutIcon /> 로그아웃
        </button>
      </div>
    </div>
  );
}
