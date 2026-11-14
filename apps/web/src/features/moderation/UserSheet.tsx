"use client";
import type { ChatItem } from "@nabi/shared/chat.ts";
import { CHAT_BAN_LABEL, CHAT_BAN_MEMO_MAX, moderationApi, type ChatBan } from "@nabi/shared/moderation.ts";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, cx, Input } from "@/shared/ui";
import { ReportForm, Sheet } from "./ReportSheet";

type Props = { item: ChatItem; broadcastId: string; isOwner: boolean; onClose: () => void };
type Duration = keyof typeof CHAT_BAN_LABEL;

/** 채팅에서 닉네임을 누르면 올라오는 사용자 시트(4-13, 4-14). 익명 후원은 "이 메시지 신고"만 있다. */
export function UserSheet({ item, broadcastId, isOwner, onClose }: Props) {
  const anonymous = !item.authorId;
  const [view, setView] = useState<"menu" | "chat" | "user">("menu");
  const [bans, setBans] = useState<ChatBan[] | null>(null);
  const [duration, setDuration] = useState<Duration>("1d");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOwner && !anonymous) void apiFetch(moderationApi.listChatBans).then((r) => setBans(r.items), () => setBans([]));
  }, [isOwner, anonymous]);

  const banned = bans?.some((b) => b.userId === item.authorId);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  if (view !== "menu") {
    const target = view === "chat" ? ({ targetType: "chat", targetId: item.messageId, broadcastId } as const) : ({ targetType: "user", targetId: item.authorId! } as const);
    return (
      <Sheet title="신고하기" onClose={onClose}>
        <ReportForm target={target} label={view === "chat" ? "이 메시지를 신고해요" : `${item.authorNickname}님을 신고해요`} onDone={onClose} onBack={() => setView("menu")} />
      </Sheet>
    );
  }

  return (
    <Sheet
      title={anonymous ? "익명 후원" : item.authorNickname}
      badge={
        <>
          {!anonymous && item.authorGrade && item.authorGrade !== "알" ? <span className={cx("rounded-full bg-raised px-2 py-0.5 text-badge-12", item.authorGrade === "애벌레" ? "text-success" : "border border-strong text-text")}>{item.authorGrade}</span> : undefined}
        </>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-1">
        <button onClick={() => setView("chat")} className="flex h-10 items-center rounded-sm px-3 text-left text-body-16 hover:bg-hover">
          이 메시지 신고
        </button>
        {!anonymous && (
          <button onClick={() => setView("user")} className="flex h-10 items-center rounded-sm px-3 text-left text-body-16 hover:bg-hover">
            사용자 신고
          </button>
        )}
      </div>
      {isOwner && !anonymous && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {banned ? (
            <Button variant="secondary" size="lg" loading={busy} onClick={() => run(() => apiFetch(moderationApi.unbanChat, undefined, { userId: item.authorId! }), "채팅 금지를 풀었어요")}>
              채팅 금지 해제
            </Button>
          ) : (
            <>
              <div className="flex gap-2" role="radiogroup" aria-label="기간">
                {(Object.keys(CHAT_BAN_LABEL) as Duration[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={duration === d}
                    onClick={() => setDuration(d)}
                    className={cx("h-8 flex-1 rounded-full text-caption-12", duration === d ? "bg-accent text-accent-ink" : "border border-line bg-raised text-muted hover:bg-hover")}
                  >
                    {CHAT_BAN_LABEL[d]}
                  </button>
                ))}
              </div>
              <Input value={memo} maxLength={CHAT_BAN_MEMO_MAX} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" aria-label="메모" />
              <Button variant="danger" size="lg" loading={busy} onClick={() => run(() => apiFetch(moderationApi.banChat, { userId: item.authorId!, duration, memo }), "이 방송에서 채팅을 막았어요")}>
                이 방송에서 채팅 금지
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
