import { CHAT_INTERVAL_MS } from "@nabi/shared/chat.ts";

/** 마지막으로 보낸 때부터 1초가 안 지났으면 도배다(4-7). */
export const tooFast = (lastAt: Date | null, now: Date) => !!lastAt && now.getTime() - lastAt.getTime() < CHAT_INTERVAL_MS;
