"use client";
import { recordingApi, type Recording } from "@nabi/shared/recording.ts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatElapsed, formatTime } from "@/shared/lib/format";
import { Avatar, Button, EmptyState, Skeleton, StatusBadge, VideoIcon } from "@/shared/ui";

const gridCls = "grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6 md:gap-y-8 min-[1200px]:grid-cols-4";

/** 다시보기 목록(4-9): 볼 수 있고 공개한 녹화를 최근 순으로. 비로그인도 볼 수 있다. */
export default function ReplaysPage() {
  const [items, setItems] = useState<Recording[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    apiFetch(recordingApi.listReplays)
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  return (
    <div className="flex w-full flex-1 flex-col gap-8 px-4 py-6 md:p-8">
      <h1 className="text-heading-28">다시보기</h1>
      {error ? (
        <EmptyState title="다시보기를 불러오지 못했어요" description={error} action={<Button variant="secondary" onClick={load}>다시 시도</Button>} />
      ) : items === null ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState title="아직 공개된 다시보기가 없어요" />
      ) : (
        <ul className={gridCls}>
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/replays/${r.id}`} className="flex gap-3 md:flex-col">
                <div className="relative grid aspect-video w-32 shrink-0 place-items-center overflow-hidden rounded-sm bg-raised text-subtle md:w-full">
                  <VideoIcon size={24} />
                  <span className="absolute left-2 top-2 md:left-3 md:top-3">
                    <StatusBadge status="ended" />
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 gap-3">
                  <span className="hidden md:block">
                    <Avatar name={r.ownerNickname} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="line-clamp-2 text-heading-16">
                      {r.isExample && <span className="mr-2 rounded-full border border-strong px-2 py-0.5 align-middle text-badge-12 text-muted">예시</span>}
                      {r.broadcastTitle}
                    </p>
                    <p className="truncate text-caption-12 text-muted">{r.ownerNickname}</p>
                    <p className="truncate text-caption-12 text-subtle">
                      {formatTime(r.startedAt)}
                      {r.durationMs !== null && ` · ${formatElapsed(r.durationMs)}`}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 320ms 안에 끝나면 아무것도 보여주지 않고, 더 걸리면 카드 자리만 잡은 뼈대를 보여준다(I-4).
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
