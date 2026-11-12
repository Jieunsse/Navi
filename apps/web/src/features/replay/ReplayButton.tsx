"use client";
import { recordingApi } from "@nabi/shared/recording.ts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiFetch";
import { buttonCls, PlayIcon } from "@/shared/ui";

/** 종료된 방송 화면의 "다시보기" 버튼. 공개한 녹화가 있을 때만 보인다(4-9). */
export function ReplayButton({ broadcastId }: { broadcastId: string }) {
  const [recordingId, setRecordingId] = useState<string | null>(null);
  useEffect(() => {
    apiFetch(recordingApi.broadcastReplay, undefined, { id: broadcastId })
      .then((r) => setRecordingId(r.recordingId))
      .catch(() => undefined);
  }, [broadcastId]);
  if (!recordingId) return null;
  return (
    <Link href={`/replays/${recordingId}`} className={buttonCls({ size: "lg" })}>
      <PlayIcon size={20} />
      다시보기
    </Link>
  );
}
