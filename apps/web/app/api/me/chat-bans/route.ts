import { requireUser } from "@nabi/core";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { moderation } from "@/server/moderation";

export const GET = route(moderationApi.listChatBans, async ({ req }) => ({ items: await moderation().listChatBans(await requireUser(authHeader(req))) }));

export const POST = route(moderationApi.banChat, async ({ req, body }) => {
  await moderation().banChat(await requireUser(authHeader(req)), body);
  return { ok: true as const };
});
