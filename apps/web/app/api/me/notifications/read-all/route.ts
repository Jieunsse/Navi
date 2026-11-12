import { requireUser } from "@nabi/core";
import { notificationUseCases } from "@nabi/core/application/notification.ts";
import { notificationApi } from "@nabi/shared/notification.ts";
import { authHeader, route } from "@/server/route";

export const POST = route(notificationApi.readAll, async ({ req }) => {
  await notificationUseCases().readAll(await requireUser(authHeader(req)));
  return { ok: true as const };
});
