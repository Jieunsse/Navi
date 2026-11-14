"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useHomeBroadcasts, type LiveBroadcast } from "@/entities/broadcast/model";
import { formatTime, sourceLabel } from "@/shared/lib/format";
import { Avatar, buttonCls, EmptyState, RadioIcon, Skeleton, StatusBadge, VideoIcon } from "@/shared/ui";

const gridCls = "grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6 md:gap-y-8 min-[1200px]:grid-cols-4";

export default function HomePage() {
  const { live, ready, loading } = useHomeBroadcasts();
  const empty = !loading && !live?.length && !ready?.length;

  return (
    <div className="flex w-full flex-1 flex-col gap-8 px-4 py-6 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-heading-28">지금 방송</h1>
        <Link href="/studio/new" className={buttonCls({ variant: "live" })}>
          <RadioIcon />
          방송하기
        </Link>
      </div>
      {loading ? (
        <ListSkeleton />
      ) : empty ? (
        <EmptyState
          title="지금 방송 중인 사람이 없어요"
          action={
            <Link href="/studio/new" className={buttonCls({ variant: "live" })}>
              <RadioIcon />
              방송하기
            </Link>
          }
        />
      ) : (
        <>
          <Section title="방송 중" items={live ?? []} />
          <Section title="곧 시작해요" items={ready ?? []} />
        </>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: LiveBroadcast[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-heading-16 text-muted">
        {title} · {items.length}
      </h2>
      <ul className={gridCls}>
        {items.map((b) => (
          <li key={b.id}>
            <BroadcastCard b={b} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// 320ms 안에 끝나면 아무것도 보여주지 않고, 더 걸리면 카드 자리만 잡은 뼈대를 보여준다(B-5). 뼈대는 움직이지 않는다.
function ListSkeleton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 320);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <ul className={gridCls} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex gap-3 md:flex-col">
          <Skeleton className="aspect-video w-32 shrink-0 md:w-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// 시안의 BroadcastCard. 휴대폰은 한 줄 목록(썸네일 128×72), 태블릿 이상은 카드.
function BroadcastCard({ b }: { b: LiveBroadcast }) {
  const isLive = b.status === "live";
  return (
    <Link href={`/live/${b.id}`} className="group flex gap-3 md:flex-col">
      <div className="relative grid aspect-video w-32 shrink-0 place-items-center overflow-hidden rounded-sm bg-raised text-subtle md:w-full">
        {b.sourceType === "camera" ? <VideoIcon size={24} /> : <RadioIcon size={24} />}
        <span className="absolute left-2 top-2 flex gap-1 md:left-3 md:top-3">
          <StatusBadge status={b.status} />
          {b.seedData && <span className="inline-flex items-center rounded-xs bg-raised px-2 py-1 text-badge-12 text-muted">예시</span>}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="hidden md:block">
          <Avatar name={b.ownerNickname} live={isLive} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 text-heading-16">{b.title}</p>
          <p className="truncate text-caption-12 text-muted">
            {b.ownerNickname} · {sourceLabel[b.sourceType]}
          </p>
          <p className="truncate text-caption-12 text-subtle">{isLive ? `${formatTime(b.startedAt)} 시작` : `${formatTime(b.createdAt)}에 만듦 · 곧 시작`}</p>
        </div>
      </div>
    </Link>
  );
}
