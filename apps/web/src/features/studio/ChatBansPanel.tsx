"use client";
import { CHAT_BAN_LABEL, moderationApi, type ChatBan } from "@nabi/shared/moderation.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, EmptyState, Spinner } from "@/shared/ui";

const left = (endAt: string) => {
  const m = Math.max(0, Math.ceil((+new Date(endAt) - Date.now()) / 60_000));
  return m >= 1440 ? `${Math.floor(m / 1440)}일 ${Math.floor((m % 1440) / 60)}시간` : m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
};

/** 내 방송 관리의 "활동 제한" 탭(4-14). 내가 건 채팅 제한을 보고 푼다. */
export function ChatBansPanel() {
  const [items, setItems] = useState<ChatBan[] | null>(null);
  const load = useCallback(() => apiFetch(moderationApi.listChatBans).then((r) => setItems(r.items), () => setItems([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function unban(b: ChatBan) {
    try {
      await apiFetch(moderationApi.unbanChat, undefined, { userId: b.userId });
      toast.success(`${b.nickname}님의 제한을 풀었어요`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    }
  }

  if (!items) return <Spinner />;
  if (items.length === 0) return <EmptyState title="걸어 둔 활동 제한이 없어요" description="채팅에서 닉네임을 누르면 이 방송에서 채팅을 막을 수 있어요" />;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((b) => (
        <li key={b.userId} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-4">
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-heading-16">
              {b.nickname} <span className="text-caption-12 text-subtle">· {CHAT_BAN_LABEL[b.duration]}{b.endAt ? `, ${left(b.endAt)} 남음` : ""}</span>
            </p>
            {b.memo && <p className="text-caption-12 text-muted">메모: {b.memo}</p>}
            <p className="text-caption-12 text-subtle">{formatTime(b.createdAt)}에 걸었어요</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void unban(b)}>해제</Button>
        </li>
      ))}
    </ul>
  );
}
