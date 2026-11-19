import { CHAT_INTERVAL_MS } from "@nabi/shared/chat.ts";

/** 마지막으로 보낸 때부터 1초가 안 지났으면 도배다(4-7). */
export const tooFast = (lastAt: Date | null, now: Date) => !!lastAt && now.getTime() - lastAt.getTime() < CHAT_INTERVAL_MS;

/**
 * 채팅을 고치거나 지울 수 있는지 본다. 막히면 이유 코드를, 되면 null을 준다.
 * 후원·미션 줄은 돈 기록이라 고치거나 지울 수 없다.
 */
export function chatChangeBlock(c: { kind?: string | null; authorId?: string | null; deleted?: boolean | null }, uid: string) {
  if ((c.kind ?? "chat") !== "chat") return "NOT_CHAT" as const;
  if (!c.authorId || c.authorId !== uid) return "NOT_AUTHOR" as const;
  if (c.deleted) return "DELETED" as const;
  return null;
}
