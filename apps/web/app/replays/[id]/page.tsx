"use client";
import { recordingApi } from "@nabi/shared/recording.ts";
import type { ApiRes } from "@nabi/shared";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useSession } from "@/entities/session/session";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatElapsed, formatTime, sourceLabel } from "@/shared/lib/format";
import { Avatar, buttonCls, EmptyState, HelpTip } from "@/shared/ui";

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
  if (data === null) return <EmptyState title="볼 수 없는 다시보기예요" action={<Link href="/replays" className={buttonCls({ variant: "secondary" })}>다시보기 목록</Link>} />;

  const { recording: r, broadcast: b } = data;
  return (
    <div className="flex flex-1 flex-col lg:h-[calc(100dvh-var(--size-header))] lg:flex-row lg:overflow-hidden">
      <div className="flex min-w-0 flex-col gap-4 pb-4 lg:flex-1 lg:overflow-y-auto lg:p-6">
        <video src={data.playUrl} controls playsInline className="aspect-video w-full bg-screen lg:rounded-md" />
        <div className="flex flex-col gap-2 px-4 lg:p-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 items-center rounded-full border border-line bg-raised px-3 text-caption-12 text-muted">다시보기</span>
            {r.isExample && <span className="inline-flex h-8 items-center rounded-full border border-strong px-3 text-caption-12 text-muted">예시</span>}
            <h1 className="min-w-0 flex-1 truncate text-heading-16 lg:text-heading-20">{r.broadcastTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Avatar name={r.ownerNickname} size="sm" />
            <span className="text-heading-16">{r.ownerNickname}</span>
            <span className="min-w-0 flex-1 truncate text-caption-12 text-muted">
              {sourceLabel[b.sourceType as "screen" | "camera"] ?? ""} · {formatTime(r.startedAt)}
              {r.durationMs !== null && ` · ${formatElapsed(r.durationMs)}`}
              {` · 후원 합계 ${b.donationTotal.toLocaleString("ko-KR")}꿀`}
            </span>
            {!r.isPublic && <HelpTip text="비공개 다시보기예요. 나만 볼 수 있어요" label="비공개 안내" />}
          </div>
        </div>
      </div>
      <div className="h-[60vh] min-h-80 border-t border-line lg:h-auto lg:w-[360px] lg:shrink-0 lg:border-l lg:border-t-0">
        <ChatPanel broadcastId={r.broadcastId} ownerId={r.ownerId} status="ended" room={null} title="방송 때 남긴 채팅" inputClassName="hidden" />
      </div>
    </div>
  );
}
