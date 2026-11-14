"use client";
import { notificationApi, type NotificationItem, type NotificationKind } from "@nabi/shared/notification.ts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/shared/api/apiFetch";
import { AwardIcon, BanIcon, BellIcon, EmptyState, FlagIcon, GiftIcon, HoneyIcon, IconButton, ScaleIcon, Spinner, WalletIcon } from "@/shared/ui";

const ICON: Record<NotificationKind, ReactNode> = {
  donation: <HoneyIcon />,
  mission: <GiftIcon />,
  settlement: <WalletIcon />,
  promotion: <AwardIcon />,
  report: <FlagIcon />,
  appeal: <ScaleIcon />,
  refund: <WalletIcon />,
  action: <BanIcon />,
};

function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 1440) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 1440)}일 전`;
}

/** 헤더의 알림 버튼과 패널(07 4-17). 페이지를 열 때 읽지 않은 수를, 패널을 열 때 최근 30개를 불러온다. */
export function NotificationBell({ path }: { path: string }) {
  const router = useRouter();
  // 연 화면 주소를 기억해서, 다른 화면으로 가면 저절로 닫힌다.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void apiFetch(notificationApi.unread).then((r) => setUnread(r.unread), () => {});
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpenAt(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(notificationApi.list);
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      setItems([]);
    }
  }, []);

  const toggle = () => {
    if (open) return setOpenAt(null);
    setOpenAt(path);
    setItems(null);
    void load();
  };

  const pick = (n: NotificationItem) => {
    if (!n.read) {
      setItems((l) => l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? l);
      setUnread((u) => Math.max(0, u - 1));
      void apiFetch(notificationApi.read, {}, { id: n.id }).catch(() => {});
    }
    if (n.href) {
      setOpenAt(null);
      router.push(n.href);
    }
  };

  const readAll = () => {
    setItems((l) => l?.map((x) => ({ ...x, read: true })) ?? l);
    setUnread(0);
    void apiFetch(notificationApi.readAll).catch(() => {});
  };

  return (
    <div ref={ref} className="relative">
      <IconButton label={unread > 0 ? "알림, 읽지 않은 알림이 있어요" : "알림"} aria-expanded={open} onClick={toggle}>
        <BellIcon />
        {unread > 0 && <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-live" />}
      </IconButton>
      {open && (
        <div
          role="dialog"
          aria-label="알림"
          className="fixed inset-x-4 top-[calc(var(--size-header)+8px)] z-[var(--z-dropdown)] flex max-h-[calc(100dvh-var(--size-header)-24px)] flex-col rounded-lg border border-line bg-raised p-2 shadow-overlay md:absolute md:inset-x-auto md:right-0 md:top-12 md:w-[360px]"
        >
          <div className="flex items-center justify-between p-2">
            <h2 className="text-heading-16">알림</h2>
            <button type="button" onClick={readAll} disabled={unread === 0} className="h-8 rounded-md px-3 text-caption-12 hover:bg-hover disabled:text-subtle disabled:hover:bg-transparent">
              모두 읽음
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {items === null ? (
              <div className="grid place-items-center py-10">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <EmptyState title="새 알림이 없어요" description="나비에서 일어난 일이 여기에 모여요" />
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pick(n)}
                  className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors ${n.href || !n.read ? "hover:bg-hover" : "cursor-default"}`}
                >
                  <span className="mt-0.5 shrink-0 text-text">{ICON[n.kind]}</span>
                  <span className={`min-w-0 flex-1 break-words text-body-16 ${n.read ? "text-muted" : ""}`}>{n.text}</span>
                  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-caption-12 text-subtle">
                    {ago(n.createdAt)}
                    {/* 배경 대신 점으로 읽지 않은 알림을 표시한다 */}
                    {!n.read && <span aria-label="읽지 않음" className="size-1.5 rounded-full bg-live" />}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
