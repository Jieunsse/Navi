import { requireUser } from "@nabi/core";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { authHeader, route } from "@/server/route";
import { moderation } from "@/server/moderation";

export const POST = route(moderationApi.ackWarnings, async ({ req }) => {
  await moderation().ackWarnings(await requireUser(authHeader(req)));
  return { ok: true as const };
});
