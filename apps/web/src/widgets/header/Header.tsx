"use client";
import { honeyApi } from "@nabi/shared/honey.ts";
import { GRADE_LABEL, type Grade } from "@nabi/shared/grade.ts";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useHomeBroadcasts } from "@/entities/broadcast/model";
import { apiFetch } from "@/shared/api/apiFetch";
import { loginHref, useSession } from "@/entities/session/session";
import { NotificationBell } from "@/features/notification/NotificationBell";
import { SanctionBanner } from "@/features/moderation/SanctionBanner";
import { Avatar, AwardIcon, buttonCls, cx, FlagIcon, GiftIcon, HistoryIcon, HoneyIcon, IconButton, LayoutGridIcon, Logo, LogOutIcon, MenuIcon, RadioIcon, ThemeToggle, UserIcon, VideoIcon, BanIcon } from "@/shared/ui";

const menus = [
  { href: "/", label: "전체 방송", icon: RadioIcon },
  { href: "/replays", label: "다시보기", icon: HistoryIcon },
];

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
          <IconButton label="사이드바 열기" aria-expanded={sideOpen} onClick={() => setSideOpen(!sideOpen)}>
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
      {sideOpen && <Sidebar onClose={() => setSideOpen(false)} path={path} />}
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

function Sidebar({ onClose, path }: { onClose: () => void; path: string }) {
  const { live } = useHomeBroadcasts(5);
  const { me } = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (me) void apiFetch(honeyApi.wallet).then((w) => setBalance(w.balance), () => undefined); // 휴대폰 사이드바의 잔액 표시(4-16)
  }, [me]);
  return (
    <div className="fixed inset-x-0 bottom-0 top-[var(--size-header)] z-[var(--z-sheet)]" role="dialog" aria-modal aria-label="사이드바">
      <button className="absolute inset-0 bg-scrim" onClick={onClose} aria-label="사이드바 닫기" />
      <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-3 overflow-y-auto border-r border-line bg-base p-2">
        {/* 휴대폰은 헤더에서 빠진 스튜디오와 화면 전환을 맨 위에 둔다(07 4-16) */}
        <div className="flex flex-col gap-1 border-b border-line pb-2 md:hidden">
          {me && (
            <>
              <SideLink href="/studio" icon={<VideoIcon />} label="스튜디오" />
              <SideLink href="/me/honey" icon={<HoneyIcon />} label={balance === null ? "내 꿀" : `내 꿀 ${balance.toLocaleString("ko-KR")}`} />
            </>
          )}
          <ThemeToggle withLabel />
        </div>
        <nav className="flex flex-col gap-1 border-b border-line pb-2">
          {menus.map((m) => (
            <SideLink key={m.href} href={m.href} icon={<m.icon />} label={m.label} active={path === m.href} />
          ))}
        </nav>
        <section className="flex flex-col gap-1">
          <h2 className="px-3 py-1 text-caption-12 text-subtle">지금 방송 중</h2>
          {live?.length ? (
            live.map((b) => (
              <Link key={b.id} href={`/live/${b.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-hover">
                <Avatar name={b.ownerNickname} live />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="min-w-0 truncate text-body-16">{b.ownerNickname}</span>
                    {b.seedData && <span className="inline-flex items-center rounded-xs bg-raised px-1 text-badge-12 text-muted">예시</span>}
                  </span>
                  <span className="block truncate text-caption-12 text-muted">{b.title}</span>
                </span>
                <span className="size-2 shrink-0 rounded-full bg-live" aria-hidden />
              </Link>
            ))
          ) : (
            <p className="px-3 text-caption-12 text-subtle">지금 방송 중인 사람이 없어요</p>
          )}
          <Link href="/" className="mt-1 rounded-md px-3 py-2 text-caption-12 hover:bg-hover">
            더보기
          </Link>
        </section>
        {/* 누르면 내 꿀의 충전 창을 연다. 내 꿀 화면이 charge=1을 읽어 연다. 비로그인이면 로그인을 거쳐 온다. */}
        <Link
          href={me ? "/me/honey?charge=1" : loginHref("/me/honey?charge=1")}
          className="mt-auto flex flex-col gap-1 rounded-md bg-surface p-3 hover:bg-hover"
        >
          <span className="flex items-center gap-2 text-heading-16">
            <HoneyIcon /> 꿀 충전
          </span>
          <span className="text-caption-12 text-muted">충전한 꿀로 준비 중이거나 방송 중인 방송자에게 후원할 수 있어요</span>
        </Link>
      </aside>
    </div>
  );
}

function SideLink({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active?: boolean }) {
  return (
    <Link href={href} className={cx("flex h-12 items-center gap-3 rounded-md px-3 text-body-16", active ? "bg-selected text-text" : "text-muted hover:bg-hover hover:text-text")}>
      {icon}
      {label}
    </Link>
  );
}
