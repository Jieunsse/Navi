"use client";
import { recordingApi } from "@nabi/shared/recording.ts";
import type { ApiRes } from "@nabi/shared";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useSession } from "@/entities/session/session";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatElapsed, formatTime, sourceLabel } from "@/shared/lib/format";
import { Center } from "@/shared/ui";

type Replay = ApiRes<typeof recordingApi.getReplay>;

/** 다시보기 보기(4-9): 영상, 방송 정보, 그 방송의 채팅, 후원 합계. 채팅도 후원도 할 수 없다. */
export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { loading } = useSession();
  const [data, setData] = useState<Replay | null | undefined>(undefined);

  // 로그인 여부가 정해진 뒤에 부른다. 소유자의 비공개 미리 보기에 로그인 토큰이 필요하기 때문이다.
  useEffect(() => {
    if (loading) return;
    apiFetch(recordingApi.getReplay, undefined, { id })
      .then(setData)
      .catch(() => setData(null));
  }, [id, loading]);

  if (data === undefined) return null;
  if (data === null) return <Center><p className="text-muted">볼 수 없는 다시보기예요</p><Link href="/replays" className="text-sm text-accent underline">다시보기 목록</Link></Center>;

  const { recording: r, broadcast: b } = data;
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 sm:px-4 sm:py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <video src={data.playUrl} controls playsInline className="aspect-video w-full bg-black sm:rounded-xl" />
        <div className="flex flex-col gap-1 px-4 sm:px-0">
          <h1 className="truncate text-lg font-bold">{r.broadcastTitle}</h1>
          <p className="text-sm text-muted">
            {r.ownerNickname} · {sourceLabel[b.sourceType as "screen" | "camera"] ?? ""} · {formatTime(r.startedAt)}
            {r.durationMs !== null && ` · ${formatElapsed(r.durationMs)}`}
            {` · 후원 ${b.donationTotal.toLocaleString("ko-KR")}꿀`}
          </p>
          {!r.isPublic && <p className="text-xs text-muted">비공개 다시보기예요. 나만 볼 수 있어요</p>}
        </div>
      </div>
      <div className="h-[60vh] min-h-[360px] lg:h-[calc(100vh-7rem)]">
        <ChatPanel broadcastId={r.broadcastId} ownerId={r.ownerId} status="ended" room={null} />
      </div>
    </div>
  );
}
