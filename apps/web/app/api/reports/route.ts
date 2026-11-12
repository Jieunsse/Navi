import { requireUser } from "@nabi/core";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { moderation } from "@/server/moderation";

export const POST = route(moderationApi.createReport, async ({ req, body }) => {
  await moderation().report(await requireUser(authHeader(req)), body);
  return { ok: true as const };
});
