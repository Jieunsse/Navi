import { categoryHue, type CategoryId } from "@nabi/shared";
import type { Recording } from "@nabi/shared/recording.ts";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LiveBroadcast } from "@/entities/broadcast/model";
import { formatElapsed, formatTime } from "@/shared/lib/format";
import { Avatar, cx, StatusBadge, VideoIcon } from "@/shared/ui";
import { CategoryIcon, hueBg } from "./category";

export const fmtCount = (n: number) => n.toLocaleString("ko-KR");

/** 영상 썸네일이 없어서 카테고리 색 배경에 아이콘과 방송자 이름 첫 글자를 얹는다. */
export function Thumb({ hue, icon, children, className }: { hue: number; icon: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div style={hueBg(hue)} className={cx("relative grid aspect-video w-full place-items-center overflow-hidden rounded-sm text-on-video", className)}>
      <span className="opacity-70">{icon}</span>
      {children}
    </div>
  );
}

export function ViewerBadge({ count }: { count: number }) {
  return <span className="inline-flex items-center rounded-xs bg-overlay px-2 py-1 text-badge-12 text-on-video">{fmtCount(count)}명</span>;
}

function Badges({ b }: { b: LiveBroadcast }) {
  return (
    <span className="absolute left-2 top-2 flex gap-1">
      <StatusBadge status={b.status} />
      {b.status === "live" && <ViewerBadge count={b.viewerCount} />}
      {b.seedData && <span className="inline-flex items-center rounded-xs bg-raised px-2 py-1 text-badge-12 text-muted">예시</span>}
    </span>
  );
}

/** 방송 카드. big이면 대표 방송처럼 크게 보여준다. */
export function BroadcastCard({ b, big, className }: { b: LiveBroadcast; big?: boolean; className?: string }) {
  const isLive = b.status === "live";
  return (
    <Link href={`/live/${b.id}`} className={cx("group flex min-w-0 flex-col gap-3", className)}>
      <Thumb hue={categoryHue(b.category)} icon={<CategoryIcon id={b.category} size={big ? 56 : 32} />}>
        <Badges b={b} />
        <span className="absolute bottom-2 right-2 text-caption-12 opacity-80">{b.ownerNickname}</span>
      </Thumb>
      <div className="flex min-w-0 gap-3">
        <Avatar name={b.ownerNickname} live={isLive} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={cx("line-clamp-2", big ? "text-heading-20" : "text-heading-16")}>{b.title}</p>
          <p className="truncate text-caption-12 text-muted">
            {b.ownerNickname} · {b.category}
          </p>
          <p className="truncate text-caption-12 text-subtle">{isLive ? `${formatTime(b.startedAt)} 시작` : "곧 시작"}</p>
        </div>
      </div>
    </Link>
  );
}

export function ReplayCard({ r, className }: { r: Recording; className?: string }) {
  return (
    <Link href={`/replays/${r.id}`} className={cx("flex min-w-0 flex-col gap-3", className)}>
      <Thumb hue={categoryHue("잡담" satisfies CategoryId)} icon={<VideoIcon size={32} />}>
        <span className="absolute left-2 top-2 flex gap-1">
          <StatusBadge status="ended" />
          {r.isExample && <span className="inline-flex items-center rounded-xs bg-raised px-2 py-1 text-badge-12 text-muted">예시</span>}
        </span>
        {r.durationMs !== null && <span className="absolute bottom-2 right-2 rounded-xs bg-overlay px-2 py-1 text-badge-12">{formatElapsed(r.durationMs)}</span>}
      </Thumb>
      <div className="flex min-w-0 gap-3">
        <Avatar name={r.ownerNickname} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 text-heading-16">{r.broadcastTitle}</p>
          <p className="truncate text-caption-12 text-muted">{r.ownerNickname}</p>
          <p className="truncate text-caption-12 text-subtle">{formatTime(r.startedAt)}</p>
        </div>
      </div>
    </Link>
  );
}

/** 카드 가로 줄. 좁은 화면에서는 옆으로 밀어 넘긴다. */
export function CardRow({ children }: { children: ReactNode }) {
  return <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0 [&>li]:w-56 [&>li]:shrink-0 xl:[&>li]:w-60">{children}</ul>;
}
