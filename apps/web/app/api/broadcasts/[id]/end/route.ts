import { broadcasts, requireUser } from "@nabi/core";
import { api } from "@nabi/shared";
import { authHeader, route } from "@/server/route";

export const POST = route(api.endBroadcast, async ({ req, params }) => {
  await broadcasts().endByOwner(await requireUser(authHeader(req)), params.id!);
  return { ok: true as const };
});
