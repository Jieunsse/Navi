"use client";
import Link from "next/link";
import { useHomeBroadcasts, type LiveBroadcast } from "@/entities/broadcast/model";
import { formatTime, sourceLabel } from "@/shared/lib/format";
import { Center, StatusBadge } from "@/shared/ui";

export default function HomePage() {
  const { live, ready, loading } = useHomeBroadcasts();
  const items = [...(live ?? []), ...(ready ?? [])];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">전체 방송</h1>
        <Link href="/studio/new" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
          방송하기
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <Center>
          <p className="text-muted">지금 방송 중인 사람이 없어요</p>
          <Link href="/studio/new" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
            방송하기
          </Link>
        </Center>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((b) => (
            <li key={b.id}>
              <BroadcastCard b={b} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BroadcastCard({ b }: { b: LiveBroadcast }) {
  return (
    <Link href={`/live/${b.id}`} className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 hover:border-accent/50">
      <div className="relative grid aspect-video place-items-center rounded-lg bg-surface-2 text-3xl">
        {b.sourceType === "camera" ? "📷" : "🖥️"}
        <span className="absolute left-2 top-2">
          <StatusBadge status={b.status} />
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold group-hover:text-accent">{b.title}</p>
        <p className="truncate text-sm text-muted">
          {b.ownerNickname} · {sourceLabel[b.sourceType]} · {b.status === "live" ? `${formatTime(b.startedAt)} 시작` : `${formatTime(b.createdAt)} 만듦`}
        </p>
      </div>
    </Link>
  );
}
