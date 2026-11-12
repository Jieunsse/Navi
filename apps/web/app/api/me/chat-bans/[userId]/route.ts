import { requireUser } from "@nabi/core";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { moderation } from "@/server/moderation";

export const DELETE = route(moderationApi.unbanChat, async ({ req, params }) => {
  await moderation().unbanChat(await requireUser(authHeader(req)), params.userId!);
  return { ok: true as const };
});
