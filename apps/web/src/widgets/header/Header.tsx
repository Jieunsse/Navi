"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useHomeBroadcasts } from "@/entities/broadcast/model";
import { loginHref, useSession } from "@/entities/session/session";
import { SanctionBanner } from "@/features/moderation/SanctionBanner";
import { cx } from "@/shared/ui";

const menus = [
  { href: "/", label: "전체 방송" },
  { href: "/replays", label: "다시보기" },
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
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/95 px-3 backdrop-blur sm:px-4">
        <button onClick={() => setSideOpen(true)} aria-label="사이드바 열기" className="grid size-10 place-items-center rounded-lg text-xl hover:bg-surface-2">
          ☰
        </button>
        <Link href="/" className="mr-2 text-lg font-black tracking-tight text-accent">
          나비
        </Link>
        <nav className="hidden gap-1 sm:flex">
          {menus.map((m) => (
            <Link key={m.href} href={m.href} className={cx("rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-2", path === m.href ? "text-text" : "text-muted")}>
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {loading ? null : me ? (
            <>
              <Link href="/me/honey" className="hidden h-9 items-center rounded-lg px-3 text-sm font-semibold hover:bg-surface-2 sm:inline-flex">
                🍯 꿀
              </Link>
              <Link href="/studio" className="hidden h-9 items-center rounded-lg bg-surface-2 px-3 text-sm font-semibold hover:bg-line sm:inline-flex">
                스튜디오
              </Link>
              <div ref={profileRef} className="relative">
                <button onClick={() => setProfileOpen(!profileOpen)} aria-label="내 프로필" aria-expanded={profileOpen} className="grid size-9 place-items-center rounded-full bg-accent font-bold text-accent-ink">
                  {me.nickname.slice(0, 1)}
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-11 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
                    <div className="border-b border-line px-4 py-3">
                      <p className="font-semibold">{me.nickname}</p>
                      <p className="truncate text-xs text-muted">{me.email}</p>
                    </div>
                    <nav className="flex flex-col py-1 text-sm">
                      <Link href="/studio" className="px-4 py-2.5 hover:bg-surface-2">스튜디오</Link>
                      <Link href="/me" className="px-4 py-2.5 hover:bg-surface-2">내 정보</Link>
                      <Link href="/me/honey" className="px-4 py-2.5 hover:bg-surface-2">내 꿀</Link>
                      <Link href="/me/reports" className="px-4 py-2.5 hover:bg-surface-2">내 신고 내역</Link>
                      <Link href="/me/sanctions" className="px-4 py-2.5 hover:bg-surface-2">제재 내역</Link>
                      {me.isAdmin && <Link href="/admin" className="px-4 py-2.5 hover:bg-surface-2">운영자 화면</Link>}
                      <button
                        onClick={async () => {
                          await logout();
                          router.push("/");
                        }}
                        className="px-4 py-2.5 text-left hover:bg-surface-2"
                      >
                        로그아웃
                      </button>
                    </nav>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link href={loginHref(path)} className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
              로그인
            </Link>
          )}
        </div>
      </header>
      <SanctionBanner />
      {sideOpen && <Sidebar onClose={() => setSideOpen(false)} path={path} />}
    </>
  );
}

function Sidebar({ onClose, path }: { onClose: () => void; path: string }) {
  const { live } = useHomeBroadcasts(5);
  const { me } = useSession();
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal aria-label="사이드바">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="사이드바 닫기" />
      <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto border-r border-line bg-surface p-4">
        {me && (
          <Link href="/studio" className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm font-semibold sm:hidden">
            스튜디오
          </Link>
        )}
        <nav className="flex flex-col gap-1">
          {menus.map((m) => (
            <Link key={m.href} href={m.href} className={cx("rounded-lg px-3 py-2.5 text-sm font-medium", path === m.href ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2")}>
              {m.label}
            </Link>
          ))}
        </nav>
        <section className="flex flex-col gap-2">
          <h2 className="px-3 text-xs font-semibold text-muted">지금 방송 중</h2>
          {live?.length ? (
            live.map((b) => (
              <Link key={b.id} href={`/live/${b.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface-2">
                <span className="size-2 shrink-0 rounded-full bg-live" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{b.ownerNickname}</span>
                  <span className="block truncate text-xs text-muted">{b.title}</span>
                </span>
              </Link>
            ))
          ) : (
            <p className="px-3 text-xs text-muted">지금 방송 중인 사람이 없어요</p>
          )}
          <Link href="/" className="px-3 text-xs text-muted hover:text-text">
            더보기
          </Link>
        </section>
      </aside>
    </div>
  );
}
