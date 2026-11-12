"use client";
import { recordingApi, type Recording } from "@nabi/shared/recording.ts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatElapsed, formatTime } from "@/shared/lib/format";

/** 다시보기 목록(4-9): 볼 수 있고 공개한 녹화를 최근 순으로. 비로그인도 볼 수 있다. */
export default function ReplaysPage() {
  const [items, setItems] = useState<Recording[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(recordingApi.listReplays)
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-bold">다시보기</h1>
      {error ? (
        <p className="py-20 text-center text-muted">{error}</p>
      ) : items === null ? (
        <p className="py-20 text-center text-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="py-20 text-center text-muted">아직 공개된 다시보기가 없어요</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/replays/${r.id}`} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 hover:border-accent">
                <p className="truncate font-semibold">{r.broadcastTitle}</p>
                <p className="text-sm text-muted">{r.ownerNickname}</p>
                <p className="text-xs text-muted">
                  {formatTime(r.startedAt)} · {r.durationMs === null ? "" : formatElapsed(r.durationMs)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
