import { requireUser } from "@nabi/core";
import { notificationUseCases } from "@nabi/core/application/notification.ts";
import { notificationApi } from "@nabi/shared/notification.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(notificationApi.read, async ({ req, params }) => {
  await notificationUseCases().read(await requireUser(authHeader(req)), params.id!);
  return { ok: true as const };
});
