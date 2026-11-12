import { broadcasts, requireUser } from "@nabi/core";
import { api } from "@nabi/shared";
import { authHeader, route } from "@/server/route";

export const GET = route(api.getBroadcast, async ({ params }) => broadcasts().get(params.id!));

export const PATCH = route(api.updateBroadcast, async ({ req, body, params }) => {
  await broadcasts().update(await requireUser(authHeader(req)), params.id!, body.title);
  return { ok: true as const };
});

export const DELETE = route(api.deleteBroadcast, async ({ req, params }) => {
  await broadcasts().remove(await requireUser(authHeader(req)), params.id!);
  return { ok: true as const };
});
